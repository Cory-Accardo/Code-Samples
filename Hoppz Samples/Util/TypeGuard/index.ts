import { HttpsError } from "firebase-functions/v1/https";
import CustomType from "./CustomTypes";
import { validCustomType } from "./CustomTypes";
import dateTime from "./CustomTypes/dateTime";
import Primative from "./Primatives";
import { validPrimative } from "./Primatives";

class TypeGuard {
  partial: boolean;

  constructor(partial?: boolean) {
    if (!partial) this.partial = false;
    else this.partial = true;
  }

  /**Throws an error if the specified object is invalid */
  eval(object: any, desiredType: validPrimative | validCustomType): void {
    //Indicates that data type must be custom.
    if (typeof object === "object") {
      //Indicates that it is not valid
      if (!CustomType.isValid(desiredType))
        throw new HttpsError(
          "invalid-argument",
          `${desiredType} is an undefined custom type. Please specify in Util/TypeGuard`
        );

      if (desiredType === "dateTime") new dateTime().eval(object);
      //else if(){} ...
      else
        throw new HttpsError(
          'invalid-argument'
          ,
          `${desiredType} is defined but as of now is not evaluated by TypeGuardService. Update this if desired.`
        );
    }

    //Indicates that the object is a primative
    else {
      if (!Primative.isValid(desiredType))
        throw new HttpsError(
          "invalid-argument",
          `Attempting to evaluate a primative, but desires a non primative type: ${desiredType}`
        );
      Primative.eval(object, desiredType as validPrimative, this.partial);
    }
  }
}

export default TypeGuard;
