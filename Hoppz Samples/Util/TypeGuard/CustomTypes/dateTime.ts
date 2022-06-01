import { validPrimative } from '../Primatives'
import CustomType from './index'


class dateTime extends CustomType{

    definition: { propertyName: string; type: validPrimative}[] = (
        [
            {
                propertyName: 'nanoseconds',
                type: 'number'
            },
            {
                propertyName: 'seconds',
                type: 'number'
            },
            {
                propertyName: 'toDate',
                type: 'function'
            },
            {
                propertyName: 'toMillis',
                type: 'function'
            },
            {
                propertyName: 'isEqual',
                type: 'function'
            },
            {
                propertyName: 'valueOf',
                type: 'function'
            },
        ]
        )

    get toString(): string {
        return "dateTime"
    }
    



}

export default dateTime