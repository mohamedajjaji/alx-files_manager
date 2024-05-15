import redisClient from './redis';
import dbClient from './db';

async function getAuthToken(request) {
  const token = request.headers['x-token'];
  return `auth_${token}`;
}

// Checks authentication against verified information and returns the userId of the user
async function findUserIdByToken(request) {
  const key = await getAuthToken(request);
  const userId = await redisClient.get(key);
  return userId || null;
}

// Gets the user by userId and returns the first user found
async function findUserById(userId) {
  const userExistsArray = await dbClient.users.find(`ObjectId("${userId}")`).toArray();
  return userExistsArray[0] || null;
}

export { findUserIdByToken, findUserById };
