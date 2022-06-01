import { HttpsError } from "firebase-functions/v1/https";

export type validPrimative =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "symbol"
  | "undefined"
  | "function";

class Primative {

  static isValid(type: any) {
    return (
      typeof type === "bigint" ||
      typeof type === "boolean" ||
      typeof type === "function" ||
      typeof type === "number" ||
      typeof type === "string" ||
      typeof type === "symbol" ||
      typeof type === "undefined"
    );
  }

  static eval(
    primative: any,
    desiredType: validPrimative,
    partial: boolean
  ) {
    if(partial){
      if(primative && typeof primative !== desiredType) `field with the value: ${primative} does not equal intended type: ${desiredType}`
    }
    else{
      if(primative === undefined) throw new HttpsError('invalid-argument',`A field is undefined. Check the type specifications!`)
      else if(typeof primative !== desiredType) `field with the value: ${primative} does not equal intended type: ${desiredType}`
    }
  }
}

export default Primative;
