const amqp = require("amqplib");

const RABBITMQ_URL = "amqp://localhost";

let channel;

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    console.log("Connected to RabbitMQ");
  } catch (error) {
    console.error("Failed to connect to RabbitMQ:", error);
  }
}

async function publishToQueue(queueName, message) {
  try {
    if (!channel) {
      console.error("RabbitMQ channel is not initialized");
      return;
    }
    await channel.assertQueue(queueName, { durable: true });
    channel.sendToQueue(queueName, Buffer.from(message));
    console.log(`Message sent to RabbitMQ queue "${queueName}":`, message);
  } catch (error) {
    console.error("Failed to send message to RabbitMQ:", error);
  }
}

async function consumeFromQueue(queueName, callback) {
  try {
    if (!channel) {
      console.error("RabbitMQ channel is not initialized");
      return;
    }
    await channel.assertQueue(queueName, { durable: true });
    channel.consume(queueName, (message) => {
      if (message !== null) {
        callback(message.content.toString());
        channel.ack(message);
      }
    });
    console.log(`Consuming messages from RabbitMQ queue "${queueName}"`);
  } catch (error) {
    console.error("Failed to consume message from RabbitMQ:", error);
  }
}

module.exports = {
  connectRabbitMQ,
  publishToQueue,
  consumeFromQueue,
};
