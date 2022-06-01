When I first onboarded with Hoppz, the preexisting codebase was exceptionally problematic. Some issues included: 

1. The shortsighted decision to use a NoSQL database for this type of application.
2. The great deal of incosistency between data types in various versions
3. An undefined formal protocol for communication between backend and frontend components.

However, to resolve this and provide backwards compatibility to previous app versions, I created many useful utility programs:

TimeConverter: Due to inconsistent date / time formats being used in the front end and backend, I created a runtime translation of various date formats (epoch seconds, utc strings, etc) to create a formal protocol between the entire application.

TypeGuard: Due to frequent frontend issues being caused by misuse of backend APIs, as well as inconsistent data formats in previous app versions, I created runtime type checking that helped the entire development team create reliable and cohesive updates.