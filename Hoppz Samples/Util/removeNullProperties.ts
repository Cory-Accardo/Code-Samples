
/**
 *  Removes any null properties from an object and returns it in place. This is useful to avoid firebase errors
 * for undefined properties.
 */

export default function removeNullProperties(obj : any){
  Object.keys(obj).forEach((k) => obj[k] == null && delete obj[k]);

  }