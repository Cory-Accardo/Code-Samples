const express = require('express') //express framework
const cors = require('cors') //enable cors
const mongoose = require('mongoose') //mongodb
require('dotenv').config(); //dotenv config 
const app = express() //init app function
const axios = require('axios')
const jwt = require('jsonwebtoken')
const processReward = require('./utils/processReward');
const ResponseObj = require('./utils/ResponseObj');
const Settlement = require('./models/settlement.model');
const User = require('./models/user.model');

/*
~~~~~~~~~~~
ENV Urls
~~~~~~~~~~~
 */

const nayax_url = process.env.NAYAX_URL
const uri = process.env.ATLAS_URI;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

/*
~~~~~~~~~~~
HTTP Server
~~~~~~~~~~~
 */

const server = require('http').createServer(app) //supply to http server
const port = 8080;
server.listen(port, () => {
  console.log('debug', `Server running on port: ${port}`)
})

/*
~~~~~~~~~~~
Middleware
~~~~~~~~~~~
 */


app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(cors())
app.use(express.json())

/*
~~~~~~~~~~~~~~~~
Mongoose MONGODB
~~~~~~~~~~~~~~~~
 */

mongoose.connect(uri, {useUnifiedTopology: true, useNewUrlParser: true, useCreateIndex: true });
const connection = mongoose.connection;
connection.once('open', () => {
  console.log('debug', "MongoDB database connection success")
})

/*
~~~~~~~~~~~~~~~~
Socket.io config
~~~~~~~~~~~~~~~~
 */

const ioserver = require('http').createServer(express());  
const io = require('socket.io')(ioserver, {

    cors: {
        origin: "*"
      }

});
ioserver.listen(2000);

io.engine.on("connection_error", (err) => {
    console.log('error', err);
  });




/*
~~~~~~~~~~~~~~~~~~
User starts machine
~~~~~~~~~~~~~~~~~~~
 */

io.on('connection', (client) => {
    client.on("error", err =>{
      console.log('error', err);
    })


    client.on("notify", async (data, callback) => {
        let u;

        const {refreshToken, terminalId} = data;

        try {
            const {id} = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
            u = await User.findOne({ _id: id });
        }
        catch(err){
            callback({
                status: "unauthorized"
              });
        }



        if(u){
              const customer = await stripe.customers.retrieve(
                u.stripeid
              );


          
            if(!customer.invoice_settings.default_payment_method){ //ensures that customer has a default payment method before initiating process
              callback({
                status: "no_default_payment"
              });
            }
            else{
                const payload =  { //payload to POST to NAYAX
                  AppUserId: u.id,
                  TerminalId: terminalId,
                  TransactionId: client.id.concat(u.stripeid),
                  SecretToken: process.env.NAYAX_SECRET_KEY, //fill this in a .env file
              };

              axios.post(nayax_url + '/start', payload)
              .then( nres => {
                if(nres.data.Status.Verdict === "Approved"){
                  callback({
                    status: "success"
                  });
                }
                else{
                  callback({
                    status: "failure"
                  });
                }
              })
              .catch( error => {
                  callback({
                      status: "failure"
                    });
              })
          }
        }

      });


})

/*
~~~~~~~~~~~~~~
CORTINA routes
~~~~~~~~~~~~~~
 */


//This proccesses the sale and will send an error to the respective socket connection if an error occurs.
//Errors must be resolved outside of the checkout lane.

app.route("/Sale").post(async (req, res) => {
  

  const {TransactionId} = req.body

  const socketid = req.body.TransactionId.substring(0,20);
  const stripeid = req.body.TransactionId.substring(20, 38);
  const {Products} = req.body;

  const customer = await stripe.customers.retrieve(
      stripeid
    );



  const paymentMethod = await stripe.paymentMethods.retrieve(
      customer.invoice_settings.default_payment_method
      
    );



  let rewardsDeductedAmount = await processReward(req.body)



  await io.to(socketid).emit("sale-obj", {
      paymentMethod: paymentMethod,
      products: Products,
      amount: rewardsDeductedAmount,
  });
  rewardsDeductedAmount *= 100; //to readjust decimal to stripe protocol
  rewardsDeductedAmount = Math.ceil(rewardsDeductedAmount); //ensures that number is an integer
  
  try{
    const intent = await stripe.paymentIntents.create({ //attempt a payment Intent
      amount: rewardsDeductedAmount,
      currency: 'usd',
      customer: stripeid,
      payment_method: customer.invoice_settings.default_payment_method,
      off_session: true,
      confirm: true,
      receipt_email: customer.email
  })

  if(intent.status === "succeeded"){
    await io.to(socketid).emit("payment-success");

    const settlement = new Settlement({ //Saving a settlement into the DB for later retrieval.
      FinalAmount: (rewardsDeductedAmount / 100), //readjust back to normal values
      TransactionId: TransactionId, 
      stripeid: stripeid,
      Products: Products,
    });

    await settlement.save();

    return res.status(200).json(ResponseObj.createSuccess(TransactionId, "Successful transaction!"));
  }
}


  catch(err){
      await io.to(socketid).emit("payment-error",{
          error_code: err.code,
          error: err.message,
      })
      return res.status(500).json(ResponseObj.createFailure(TransactionId, "9", err.message))
  }

})

    