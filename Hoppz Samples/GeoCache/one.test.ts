// import { createClient } from "redis";
// import { GeoCoordinates, GeoUnits, GeoSearchBy, GeoSearchOptions} from "@node-redis/client/dist/lib/commands/generic-transformers"
// import GeoCache from "../Models/GeoCache";
// import Establishments from "../Models/Establishments"
// import * as admin from "firebase-admin";
// import * as geofire from "geofire-common";
import GeoCacheService from ".";

// console.log(geofire.geohashQuery('kxtkurj8pq', geofire.GEOHASH_PRECISION));

const cache = new GeoCacheService();


const test = async () =>{
    await cache.setUserLocation('Long Beach', {latitude : 33.76816985175089, longitude: -118.17740592764079});
    await cache.setUserLocation('Hong Kong', {latitude : 22.288852566409833, longitude: 114.15523918355574})
    await cache.setUserLocation('Carthage', {latitude : 36.868221703446494, longitude: 10.32240371595895})
    await cache.setUserLocation('Irvine', {latitude : 33.684762039267476, longitude: -117.83593551017715})
    console.log(

        await cache.userDistanceFromEstablishment('Cory', '02LDP53qilKUqpgQ0IKO')






    )
    
}

test();