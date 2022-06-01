import { firestore } from "firebase-admin";
import * as moment from "moment-timezone";
import { TIME_ZONE } from "../../index";
import temporaryEpochSolution from "./TemporaryEpochSolution";
//@ts-ignore
moment.suppressDeprecationWarnings = true;

export default class {
  private static isTimestamp = (property: any) => {
    return (
      property &&
      typeof property.toDate === "function" &&
      typeof property.toMillis === "function" &&
      typeof property.isEqual === "function" &&
      typeof property.valueOf === "function" &&
      typeof property.nanoseconds === "number" &&
      typeof property.seconds === "number"
    );
  };

  private static isMoment = (property: any) =>
    moment(property).isValid() && typeof property === "string";

  public static momentToTimestamp = (str: string) => {
    const m = moment(str).tz(TIME_ZONE).toDate();
    return firestore.Timestamp.fromDate(m);
  };

  private static timestampToMoment = (
    timestamp: FirebaseFirestore.Timestamp
  ) => {
    return moment(timestamp.toDate()).tz(TIME_ZONE).format();
  };

  private static transformProps(
    obj: any,
    from: "timestamp" | "moment",
    to: "timestamp" | "moment"
  ) {
    let detect: Function;
    let transform: Function;
    from === "timestamp"
      ? (detect = this.isTimestamp)
      : (detect = this.isMoment);
    to === "timestamp"
      ? (transform = this.momentToTimestamp)
      : (transform = this.timestampToMoment);

    if (typeof obj != "object" || !obj) return;
    Object.entries(obj).forEach(([key, value]: [string, any]) => {
      if (detect(value)) {
        obj[key] = transform(value);
      } else {
        this.transformProps(value, from, to);
      }
    });
  }

  public static propsMomentToTimestamp(obj: any) {
    temporaryEpochSolution(obj);
    this.transformProps(obj, "moment", "timestamp");
  }

  public static propsTimestampToMoment(obj: any) {
    this.transformProps(obj, "timestamp", "moment");
  }
}
