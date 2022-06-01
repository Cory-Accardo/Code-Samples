/**
 * Converts ES6 map into plain JS object to allow for the cloud function to properly seralize the map
 */

export default function(map : Map<any, any>) : any{
    return [...map.entries()].reduce((obj : any, [key, value]) => (obj[key] = value, obj), {}); 
}