import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  // Should return whether Redis and the database are alive

  static getStatus(request, response) {
    const status = {
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    };
    response.status(200).send(status);
  }

  // Should return the number of users and files in the database
  static async getStats(request, response) {
    const stats = {
      users: await dbClient.nbUsers(),
      files: await dbClient.nbFiles(),
    };
    response.status(200).send(stats);
  }
}

module.exports = AppController;
