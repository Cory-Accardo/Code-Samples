//TYPES
import GeoCache from "../../Models/GeoCache";
import Establishments from "../../Models/Establishments";

//SERVICES

import NotificationService from "../Notifications";
import { createClient } from "redis";
import {
  GeoCoordinates,
  GeoSearchBy,
  GeoSearchOptions,
} from "@node-redis/client/dist/lib/commands/generic-transformers";

import * as admin from "firebase-admin";
import * as geofire from "geofire-common";
import Establishment from "../Establishments";

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = parseInt(process.env.REDIS_PORT);
const REDIS_PASS = process.env.REDIS_PASS;

if (!REDIS_HOST || !REDIS_PORT || !REDIS_PASS) {
  throw Error(
    "REDIS_HOST, REDIS_PORT, or REDIS_PASS is not defined in env file."
  );
}

const client = createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
  password: REDIS_PASS,
});

client.on("error", (err: any) => console.error("ERR:REDIS:", err));

class GeoCache {
  private DEFAULT_USER_SEARCH_RADIUS: GeoSearchBy = { radius: 50, unit: "km" };

  private DEFAULT_ESTABLISHMENT_GEOMETRY: GeoSearchBy = {
    height: 50,
    width: 50,
    unit: "m",
  };


  private DEFAULT_CONFLICT_RECENCY = 10800000; //3 HOURS

  private DEFAULT_TIME_RECENCY = 10800000; //3 HOURS

  private CHECK_IN_RADIUS = 50; //in meters

  private DEFAULT_USER_NOTIF_RADIUS: GeoSearchBy = { radius: 25, unit: "km" };

  private ESTABLISHMENT_KEY: GeoCache.geoType = "establishment-locations";

  private USER_KEY: GeoCache.geoType = "user-locations";

  private USER_LAST_UPDATED_KEY: GeoCache.genericType = "user-last-updated";

  private ESTABLISHMENT_GEOMETRY_KEY: GeoCache.genericType =
    "establishment-geometry";

  private CONFLICT_KEY: GeoCache.genericType = "conflict-resolution";

  constructor() {
    client.connect();
  }

  //******************************//
  //PRIVATE MEMBERS FOR BASIC CRUD
  //******************************//

  //GENERIC

  private async setGeneric(
    genericType: GeoCache.genericType,
    key: any,
    value: any
  ) {
    return client.hSet(genericType, key, value);
  }

  private async getGeneric(genericType: GeoCache.genericType, key: any) {
    return client.hGet(genericType, key);
  }


  //GEO

  private async setLocation(
    geoType: GeoCache.geoType,
    key: string,
    position: GeoCoordinates
  ) {
    return client.geoAdd(geoType, {
      ...position,
      member: key,
    });
  }

  /** Get's geoCached location and returns null if location doesn't exist */
  private async getLocation(
    geoType: GeoCache.geoType,
    key: string
  ): Promise<{ latitude: string; longitude: string } | null> {
    return (await client.geoPos(geoType, key))[0];
  }

  //******************************//
  //SPECIALIZED CRUD
  //******************************//

  //CONFLICT RESOLUTION

  private async addConflict(userId: string, nearbyEstablishments: string[]) {
    const value: GeoCache.conflictResolution = {
      dateTime: Date.now(),
      nearbyEstablishments: nearbyEstablishments,
      selected: null,
    };
    await this.setGeneric(this.CONFLICT_KEY, userId, JSON.stringify(value));
  }

  private async removeConflict(userId: string) {
    await this.setGeneric(this.CONFLICT_KEY, userId, null);
  }

  private async hasConflict(userId: string) {
    const conflict: GeoCache.conflictResolution | null = JSON.parse(
      await this.getGeneric(this.CONFLICT_KEY, userId)
    );
    if (!conflict) return false;
    //There is a conflict detected, but we must make sure that the conflict is not outdated.
    else {
      if (!this.isWithinConflictTimebound(conflict.dateTime)) {
        await this.removeConflict(userId);
        return false;
      }
      //Conflict must be valid still
      return conflict;
    }
  }

  public async setConflictResolution(userId: string, establishmentId: string) {
    let value: GeoCache.conflictResolution = JSON.parse(
      await this.getGeneric(this.CONFLICT_KEY, userId)
    );
    value.selected = establishmentId;
    await this.setGeneric(this.CONFLICT_KEY, userId, JSON.stringify(value));
  }


  //USER LOCATIONS

  public async setUserLocation(userId: string, userLocation: GeoCoordinates) {
    //Sets updated location
    await this.setLocation(this.USER_KEY, userId, userLocation);
    //Informs that server has updated location
    await this.setUserLastUpdated(userId);

    //Evaluates whether user will need to check-in at this updated location
    const requiresCheckIn = await this.requiresCheckIn(userId);
    if (requiresCheckIn) {
      await new NotificationService(userId).construct({
        addToFeed: false,
        sendPush: true,
        nearbyEstablishments: JSON.stringify(requiresCheckIn),
        name: "check-in",
        pushTitle: "Check in!",
        pushBody: "It looks like you're in a venue! Please check in",
      });
    }
  }

  //USER LAST UPDATED

  private async setUserLastUpdated(userId: string) {
    return this.setGeneric(
      this.USER_LAST_UPDATED_KEY,
      userId,
      new Date().getTime()
    );
  }

  public async getUserLastUpdated(userId: string) {
    return this.getGeneric(this.USER_LAST_UPDATED_KEY, userId);
  }

  //ESTABLISHMENT LOCATIONS

  private async getEstablishmentCoordinates(
    establishmentId: string
  ): Promise<GeoCoordinates> {
    return this.getLocation(this.ESTABLISHMENT_KEY, establishmentId);
  }

  //ESTABLISHMENT GEOMETRY

  private async setGeometry(establishmentId: string, geometry: GeoSearchBy) {
    return this.setGeneric(
      this.ESTABLISHMENT_GEOMETRY_KEY,
      establishmentId,
      JSON.stringify(geometry)
    );
  }

  private async getGeometry(establishmentId: string): Promise<GeoSearchBy> {
    return JSON.parse(
      await this.getGeneric(this.ESTABLISHMENT_GEOMETRY_KEY, establishmentId)
    );
  }

  //******************************//
  // CACHING TOOLS / MECHANISMS
  //******************************//

  /** Takes a firebase snapshot and converts it into redis-ready data.
   * Also caches data in
   */
  private convertToEstablishmentLocation(
    establishment: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
  ): GeoCache.establishmentLocation {
    let {
      location,
      geometry,
    } = establishment.data() as Establishments.Document;

    //This ensures that establishment geometry is cached.
    if (geometry) {
      this.setGeometry(establishment.id, geometry);
    } else {
      geometry = this.DEFAULT_ESTABLISHMENT_GEOMETRY;
      this.setGeometry(establishment.id, geometry);
    }

    return {
      id: establishment.id,
      coordinates: {
        latitude: location.lat,
        longitude: location.lng,
      },
      geometry: geometry,
    } as GeoCache.establishmentLocation;
  }

  private async pullAllEstablishmentLocationsFromDb(): Promise<
    GeoCache.establishmentLocation[]
  > {
    const establishments = (
      await admin.firestore().collection("Establishments").get()
    ).docs;
    return establishments.map((establishment) =>
      this.convertToEstablishmentLocation(establishment)
    );
  }

  /**Returns true if establishments were successfully cached.
   * If establishments are already cached, returns false.
   */
  public async cacheEstablishmentLocations(forced = false): Promise<boolean> {
    if (forced === false && (await this.areEstablishmentLocationsCached()))
      throw Error(
        "Establishments appear to already be cached. If you wish to rewrite anyways, pass forced = true as a param"
      );

    const locations = await this.pullAllEstablishmentLocationsFromDb();
    try {
      await Promise.all(
        locations.map(async (location) => {
          return await this.setLocation(
            this.ESTABLISHMENT_KEY,
            location.id,
            location.coordinates
          );
        })
      );
    } catch (e: any) {
      if (e.replyError === "ERR value is not a valid float") return true; // This is a strange bug, I'm not sure why its happening, but it seems to still work
    }

    return true;
  }

  private async areEstablishmentLocationsCached(): Promise<boolean> {
    const numCached = await client.zCard(this.ESTABLISHMENT_KEY);
    const numSaved = (
      await admin.firestore().collection("Establishments").get()
    ).docs.length;

    if (numCached !== numSaved) return false;

    return true;
  }

  //******************************//
  // UTILITY TOOLS
  //******************************//

  private isWithinConflictTimebound(dateTime: number) {
    if (Date.now() - dateTime > this.DEFAULT_CONFLICT_RECENCY) return false;
    else return true;
  }


  private async hasConflictResolution(userId: string) {

    const getResolution = await this.getGeneric(this.CONFLICT_KEY, userId);

    const {
      selected,
      dateTime,
    }: GeoCache.conflictResolution = getResolution ? JSON.parse(getResolution) : {selected : null, dateTime: Date.now()}

    if (selected === null || !this.isWithinConflictTimebound(dateTime))
      return false;
    else return selected;
  }

  private async requiresCheckIn(userId: string) {
    //Evaluates whether a user is close enough to an establishment to warrant a check-in
    //Nearby establishments will come back sorted ascending
    const nearbyEstablishments = await this.getEstablishmentsNearUser(userId, {
      radius: this.CHECK_IN_RADIUS,
      unit: "m",
    });

    if (nearbyEstablishments.size === 0) return false;

    //Indicates user has already resolved conflict within the appropriate timebound
    if (await this.hasConflictResolution(userId)) return false;

    let ascendingEstablishmentArray = new Array<{
      establishmentId: string;
      distance: number;
    }>();

    nearbyEstablishments.forEach((value, key) =>
      ascendingEstablishmentArray.push({
        establishmentId: key,
        distance: value,
      })
    );

    const transformedEstablishments = ascendingEstablishmentArray.map(
      (ele) => ele.establishmentId
    );

    //Since a conflict was detected, we need to ensure a conflict is added.
    const conflict = await this.hasConflict(userId);
    if (!conflict) {
      await this.addConflict(userId, transformedEstablishments);
    }

    const establishmentMap = await Establishment.getEstablishmentMapCache();

    const returnedEstablishments = await Promise.all(
      ascendingEstablishmentArray.map((ele) => {
        const { name, address } = establishmentMap.get(ele.establishmentId);
        return {
          id: ele.establishmentId,
          name: name,
          address: address,
        };
      })
    );

    return returnedEstablishments;
  }

  /**Finds distance between two geocache entities. Returns null if one doesn't exist */
  private async distanceBetween(
    geoType_a: GeoCache.geoType,
    key_a: string,
    geoType_b: GeoCache.geoType,
    key_b: string
  ): Promise<number | null> {
    const position_a = await this.getLocation(geoType_a, key_a);
    const position_b = await this.getLocation(geoType_b, key_b);

    if (!position_a! || !position_b) return null;

    return geofire.distanceBetween(
      [parseFloat(position_a.latitude), parseFloat(position_a.longitude)],
      [parseFloat(position_b.latitude), parseFloat(position_b.longitude)]
    );
  }

  private async getUsersWithinTimebound(userIds: string[], timeBound: number) {
    const response = new Array<string>();

    for (const userId of userIds) {
      const lastUpdated = parseInt(await this.getUserLastUpdated(userId));
      if (Date.now() - lastUpdated <= timeBound) response.push(userId);
    }

    return response;
  }

  /**Returns nearby users as an array of strings in ascending order*/
  private async getNearby(
    geoType: GeoCache.geoType,
    position: GeoCoordinates,
    bounds: GeoSearchBy,
    options?: GeoSearchOptions
  ) {
    return client.geoSearch(geoType, position, bounds, options);
  }

  //User Location methods

  /**Returns String[] of user Ids nearby user in ascending order
   * Returns null if user doesn't exist;
   */
  public async getUsersNearUser(
    userId: string,
    geometry?: GeoSearchBy
  ): Promise<string[] | null> {
    const userLocation = await this.getLocation(this.USER_KEY, userId);
    if (!userLocation) return null;
    return this.getNearby(
      this.USER_KEY,
      userLocation,
      geometry ? geometry : this.DEFAULT_USER_SEARCH_RADIUS,
      { SORT: "ASC" }
    );
  }

  /**Returns String[] of user Ids within establishment in the past set amount of time
   * @param timebound refers to the number of milliseconds that user must have been in the establishment
   */
  public async getUsersWithinEstablishment(
    establishmentId: string,
    timebound: number = this.DEFAULT_TIME_RECENCY
  ): Promise<string[] | null> {
    
    //Retrieve all nearby users geographically, if they were active within timebound
    let usersNearby = await this.getUsersWithinTimebound(
      await this.getNearby(
        this.USER_KEY,
        await this.getEstablishmentCoordinates(establishmentId),
        await this.getGeometry(establishmentId),
        { SORT: "ASC" }
      ),
      timebound
    );

    //for each user within the establishment, this particular
    //establishment is the closest to their location. This ensures that each user
    // can only be in one establishment at a time.
    const filteredUsersNearby = new Array<string>();
    for (const userId of usersNearby) {
      const resolution = await this.hasConflictResolution(userId);
      //Determines whether user has explicitly said they are within the venue
      if (resolution && resolution === establishmentId)
        filteredUsersNearby.push(userId);
    }

    return filteredUsersNearby;
  }

  /**Returns establishmentIds near user and the distance in KM from the user*/
  public async getEstablishmentsNearUser(
    userId: string,
    geometry?: GeoSearchBy
  ): Promise<Map<string, number> | null> {
    const userLocation = await this.getLocation("user-locations", userId);
    if (!userLocation) return null;
    const establishmentsNearby = await this.getNearby(
      this.ESTABLISHMENT_KEY,
      userLocation,
      geometry ? geometry : this.DEFAULT_USER_SEARCH_RADIUS,
      { SORT: "ASC" }
    );

    const map = new Map();
    for (const establishmentId of establishmentsNearby) {
      map.set(
        establishmentId,
        await this.distanceBetween(
          this.USER_KEY,
          userId,
          this.ESTABLISHMENT_KEY,
          establishmentId
        )
      );
    }

    return map;
  }


  /**Returns a number distance in KILOMETERS beween user and establishment
   * If establishment or user doesn't exist, will return null
   */
  public async userDistanceFromEstablishment(
    userId: string,
    establishmentId: string
  ): Promise<number | null> {
    return this.distanceBetween(
      this.USER_KEY,
      userId,
      this.ESTABLISHMENT_KEY,
      establishmentId
    );
  }

  /**Returns a number distance in KILOMETERS beween two users
   * If either user doesn't exist, will return null
   */
  public async userDistanceFromUser(
    user_id_one: string,
    user_id_two: string
  ): Promise<number | null> {
    return this.distanceBetween(
      this.USER_KEY,
      user_id_one,
      this.USER_KEY,
      user_id_two
    );
  }

  /** Returns an array of User Ids that were within the range of this establishment */
  public async getUsersNearEstablishment(
    establishmentId: string
  ): Promise<string[] | null> {
    const establishmentCoords = await this.getLocation(
      this.ESTABLISHMENT_KEY,
      establishmentId
    );
    if (!establishmentCoords) return null;

    return await this.getNearby(
      this.USER_KEY,
      establishmentCoords,
      this.DEFAULT_USER_NOTIF_RADIUS
    );
  }
}

export default GeoCache;
