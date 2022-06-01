import * as moment from "moment-timezone";
import { TIME_ZONE } from "../..";

const detect = (key: string, value: number) =>
  key.toLowerCase().includes("time") && typeof value === "number";

const transform = (value: number) => moment(value).tz(TIME_ZONE).format();

/**
 * Recursively converts all epoch timestamps to moment timestamps
 */

export default function (obj: any) {
  if (typeof obj != "object") return;
  Object.entries(obj).forEach(([key, value]: [string, any]) => {
    if (detect(key, value)) {
      obj[key] = transform(value);
    } else transform(value);
  });
}
