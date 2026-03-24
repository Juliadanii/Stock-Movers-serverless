const AWS = require("aws-sdk")

const dynamodb = new AWS.DynamoDB.DocumentClient()

const TABLE_NAME = process.env.TABLE_NAME



module.exports.getMovers = async () => {

  try {

    const result = await dynamodb.scan({

      TableName: TABLE_NAME

    }).promise()



    return {

      statusCode: 200,

      headers: {

        "Content-Type": "application/json",

        "Access-Control-Allow-Origin": "*"

      },

      body: JSON.stringify(result.Items || [])

    }

  }

  catch (error) {

    return {

      statusCode: 500,

      headers: {

        "Content-Type": "application/json",

        "Access-Control-Allow-Origin": "*"

      },

      body: JSON.stringify({

        error: "failed to fetch movers",

        details: error.message

      })

    }

  }

}



module.exports.ingestMovers = async () => {

  try {

    const sampleData = [

      {

        ticker: "TSLA",

        date: new Date().toISOString().slice(0,10),

        percent_change: -3.13,

        close_price: 210.55

      }

    ]



    for (const item of sampleData) {

      await dynamodb.put({

        TableName: TABLE_NAME,

        Item: item

      }).promise()

    }



    return {

      statusCode: 200,

      body: JSON.stringify({

        message: "ingest complete"

      })

    }

  }

  catch (error) {

    return {

      statusCode: 500,

      body: JSON.stringify({

        error: "ingest failed",

        details: error.message

      })

    }

  }

}