import redis from 'redis';
import { promisify } from 'util';

// Class for performing operations with Redis service
class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.connected = true;
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.client.on('error', (error) => {
      console.log(`Redis client failed to connect: ${error.message}`);
      this.client.connected = false;
    });
    this.client.on('connect', () => {
      this.client.connected = true;
    });
  }

  // Checks if connection to Redis is Alive
  isAlive() {
    return this.client.connected;
  }

  // gets value corresponding to key in redis
  async get(key) {
    const value = await this.getAsync(key);
    return value;
  }

  // Creates a new key in redis with a specific TTL
  async set(key, value, duration) {
    this.client.setex(key, duration, value);
  }

  // Deletes key in redis service
  async del(key) {
    this.client.del(key);
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
