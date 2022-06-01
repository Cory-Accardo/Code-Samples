import Primative from "../Primatives";
import { validPrimative } from "../Primatives";

export type validCustomType = "dateTime" //Add additional here


abstract class CustomType {

    static isValid(type: any) {
        return (
          type === "dateTime"
          //Add additional here
        );
    }

    partial : boolean;

    constructor(partial : boolean = false){this.partial = partial}

    eval(object : any){
        this.definition.forEach(member =>{
            Primative.eval(object[`${member.propertyName}`], member.type, this.partial);
        })
    }

    abstract definition : Array<{
        propertyName: string,
        type : validPrimative
    }>

    abstract get toString() : string

}

export default CustomType;