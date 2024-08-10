const { Kafka, logLevel } = require("kafkajs");
const mysql = require("mysql2");
const { connectRabbitMQ, consumeFromQueue } = require("./rabbitmq");
require("dotenv").config();

// Create MySQL connection pool
const pool = mysql
  .createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })
  .promise();

// Example usage
pool
  .getConnection()
  .then((connection) => {
    console.log("Connected to the database!");
    connection.release(); // Release the connection back to the pool
  })
  .catch((err) => {
    console.error("Error connecting to the database:", err);
  });

// Connect to RabbitMQ and consume messages
connectRabbitMQ().then(() => {
  consumeFromQueue("train_activation_queue", (message) => {
    const processedMessage = JSON.parse(message);
    insertActiveTrain(
      processedMessage.trainId,
      processedMessage.stanox,
      processedMessage.timestamp
    );
  });

  consumeFromQueue("train_cancellation_queue", (message) => {
    const processedMessage = JSON.parse(message);
    insertCancelledTrain(
      processedMessage.trainId,
      processedMessage.stanox,
      processedMessage.reasonCode,
      processedMessage.timestamp
    );
  });
});

// Configuration for the Kafka brokers
const kafkaConfig = {
  brokers: ["192.0.0.1:9092"],
  logLevel: logLevel.DEBUG, // Set log level to DEBUG for detailed logging
};

// Create Kafka consumer
const kafkaConsumer = new Kafka({
  clientId: "rail_app_consumer",
  groupId: "rail_consumer_group",
  ...kafkaConfig,
}).consumer({
  groupId: "rail_consumer_group",
});

// Topics produced by the producer
const topics = ["train_activation", "train_cancellation"];

// Connect the Kafka consumer
const initKafkaConsumer = async () => {
  await kafkaConsumer.connect();
  await kafkaConsumer.subscribe({ topics });

  await kafkaConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const processedMessage = JSON.parse(message.value.toString("utf-8"));

        // Log the received message
        console.log(processedMessage);

        // Insert data into MySQL database
        if (topic === "train_activation") {
          insertActiveTrain(
            processedMessage.trainId,
            processedMessage.stanox,
            processedMessage.timestamp
          );
        } else if (topic === "train_cancellation") {
          insertCancelledTrain(
            processedMessage.trainId,
            processedMessage.stanox,
            processedMessage.reasonCode,
            processedMessage.timestamp
          );
        }

        // Add your processing logic here
        // For now, let's log that the message is being processed
        console.log("  Processing message...");
      } catch (error) {
        console.error("Error processing message:", error.message);
      }
    },
  });
};

// Function to insert active train data into the database
function insertActiveTrain(trainId, stanox, timestamp) {
  const sql =
    "INSERT INTO active_trains (train_id, stanox, timestamp) VALUES (?, ?, ?)";
  const values = [trainId, stanox, timestamp];

  pool.query(sql, values, (error, results) => {
    if (error) {
      console.error("Error inserting active train data:", error);
    } else {
      console.log("Inserted active train data:", results);
    }
  });
}

// Function to insert active train data into the database
function insertActiveTrain(trainId, stanox, timestamp) {
  // Convert timestamp to MySQL datetime format
  const mysqlTimestamp = new Date(timestamp)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const sql =
    'INSERT INTO active_trains (train_id, stanox, timestamp) VALUES (?, ?, STR_TO_DATE(?, "%Y-%m-%d %H:%i:%s"))';
  const values = [trainId, stanox, mysqlTimestamp];

  pool.query(sql, values, (error, results) => {
    if (error) {
      console.error("Error inserting active train data:", error);
    } else {
      console.log("Inserted active train data:", results);
    }
  });
}

// Function to insert cancelled train data into the database
function insertCancelledTrain(trainId, stanox, reasonCode, timestamp) {
  // Convert timestamp to MySQL datetime format
  const mysqlTimestamp = new Date(timestamp)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const sql =
    'INSERT INTO cancelled_trains (train_id, stanox, reason_code, timestamp) VALUES (?, ?, ?, STR_TO_DATE(?, "%Y-%m-%d %H:%i:%s"))';
  const values = [trainId, stanox, reasonCode, mysqlTimestamp];

  pool.query(sql, values, (error, results) => {
    if (error) {
      console.error("Error inserting cancelled train data:", error);
    } else {
      console.log("Inserted cancelled train data:", results);
    }
  });
}

// Initialize Kafka consumer
initKafkaConsumer();

// Handle process termination to close the Kafka consumer gracefully
process.on("SIGTERM", async () => {
  await kafkaConsumer.disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await kafkaConsumer.disconnect();
  process.exit(0);
});
