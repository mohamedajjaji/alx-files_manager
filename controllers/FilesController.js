import { ObjectID } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Queue from 'bull';
import { findUserIdByToken } from '../utils/findUserById';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const mime = require('mime-types');

class FilesController {
  // Should create a new file in DB and in disk
  static async postUpload(request, response) {
    const fileQueue = new Queue('fileQueue');
    // Retrieve the user based on the token
    const userId = await findUserIdByToken(request);
    if (!userId) return response.status(401).json({ error: 'Unauthorized' });

    let fileInserted;

    // Validate the request data
    const { name } = request.body;
    if (!name) return response.status(400).json({ error: 'Missing name' });
    const { type } = request.body;
    if (!type || !['folder', 'file', 'image'].includes(type)) { return response.status(400).json({ error: 'Missing type' }); }

    const isPublic = request.body.isPublic || false;
    const parentId = request.body.parentId || 0;
    const { data } = request.body;
    if (!data && !['folder'].includes(type)) { return response.status(400).json({ error: 'Missing data' }); }
    // ParentId (optional) represents the ID of the parent (default 0-> root)
    if (parentId !== 0) {
      const parentFileArray = await dbClient.files.find({ _id: ObjectID(parentId) }).toArray();
      if (parentFileArray.length === 0) return response.status(400).json({ error: 'Parent not found' });
      const file = parentFileArray[0];
      if (file.type !== 'folder') return response.status(400).json({ error: 'Parent is not a folder' });
    }

    // If there is no data and it is not a folder, return an error
    if (!data && type !== 'folder') return response.status(400).json({ error: 'Missing Data' });

    // If the type is folder, then insert into the DB with the owner as ObjectID(userId)
    if (type === 'folder') {
      fileInserted = await dbClient.files.insertOne({
        userId: ObjectID(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? parentId : ObjectID(parentId),
      });
    // If it's not a folder, store the file in the DB unscrambled
    } else {
      // Create a folder for this file
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true }, () => {});

      // Create an ID and a new path to the new file
      const filenameUUID = uuidv4();
      const localPath = `${folderPath}/${filenameUUID}`;

      // Unscramble data and write to new path
      const clearData = Buffer.from(data, 'base64');
      await fs.promises.writeFile(localPath, clearData.toString(), { flag: 'w+' });
      await fs.readdirSync('/').forEach((file) => {
        console.log(file);
      });

      // Insert into the DB
      fileInserted = await dbClient.files.insertOne({
        userId: ObjectID(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? parentId : ObjectID(parentId),
        localPath,
      });

      // If the file is an image, save it as binary data
      if (type === 'image') {
        await fs.promises.writeFile(localPath, clearData, { flag: 'w+', encoding: 'binary' });
        await fileQueue.add({ userId, fileId: fileInserted.insertedId, localPath });
      }
    }

    // Return the new file with a status code 201
    return response.status(201).json({
      id: fileInserted.ops[0]._id, userId, name, type, isPublic, parentId,
    });
  }

  // GET /files/:id
  // Return file by fileId
  static async getShow(request, response) {
    // Retrieve the user based on the token
    const token = request.headers['x-token'];
    if (!token) return response.status(401).json({ error: 'Unauthorized' });

    const keyID = await redisClient.get(`auth_${token}`);
    if (!keyID) return response.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(keyID) });
    if (!user) return response.status(401).json({ error: 'Unauthorized' });

    const idFile = request.params.id;
    if (!ObjectID.isValid(idFile)) return response.status(404).json({ error: 'Not found' });

    const fileDocument = await dbClient.db.collection('files').findOne({
      _id: ObjectID(idFile),
      userId: user._id,
    });
    if (!fileDocument) return response.status(404).json({ error: 'Not found' });

    return response.json(fileDocument);
  }

  // GET /files
  // Return the files attached to the user
  static async getIndex(request, response) {
    // Retrieve the user based on the token
    const token = request.headers['x-token'];
    if (!token) return response.status(401).json({ error: 'Unauthorized' });

    const keyID = await redisClient.get(`auth_${token}`);
    if (!keyID) return response.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(keyID) });
    if (!user) return response.status(401).json({ error: 'Unauthorized' });

    const parentId = request.query.parentId || '0';
    const page = parseInt(request.query.page, 10) || 0;

    const query = { userId: user._id };
    if (parentId !== '0') query.parentId = ObjectID(parentId);

    const files = await dbClient.db.collection('files')
      .find(query)
      .skip(page * 20)
      .limit(20)
      .toArray();

    const filesArray = files.map((file) => ({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    }));

    return response.json(filesArray);
  }

  // PUT /files/:id/publish
  static async putPublish(request, response) {
    const token = request.headers['x-token'];
    if (!token) return response.status(401).json({ error: 'Unauthorized' });

    const keyID = await redisClient.get(`auth_${token}`);
    if (!keyID) return response.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(keyID) });
    if (!user) return response.status(401).json({ error: 'Unauthorized' });

    const idFile = request.params.id;
    if (!ObjectID.isValid(idFile)) return response.status(404).json({ error: 'Not found' });

    const fileDocument = await dbClient.db.collection('files').findOne({
      _id: ObjectID(idFile),
      userId: user._id,
    });
    if (!fileDocument) return response.status(404).json({ error: 'Not found' });

    await dbClient.db.collection('files').updateOne(
      { _id: ObjectID(idFile) },
      { $set: { isPublic: true } },
    );

    const updatedFileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectID(idFile) });

    return response.status(200).json(updatedFileDocument);
  }

  // PUT /files/:id/unpublish
  static async putUnpublish(request, response) {
    const token = request.headers['x-token'];
    if (!token) return response.status(401).json({ error: 'Unauthorized' });

    const keyID = await redisClient.get(`auth_${token}`);
    if (!keyID) return response.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(keyID) });
    if (!user) return response.status(401).json({ error: 'Unauthorized' });

    const idFile = request.params.id;
    if (!ObjectID.isValid(idFile)) return response.status(404).json({ error: 'Not found' });

    const fileDocument = await dbClient.db.collection('files').findOne({
      _id: ObjectID(idFile),
      userId: user._id,
    });
    if (!fileDocument) return response.status(404).json({ error: 'Not found' });

    await dbClient.db.collection('files').updateOne(
      { _id: ObjectID(idFile) },
      { $set: { isPublic: false } },
    );

    const updatedFileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectID(idFile) });

    return response.status(200).json(updatedFileDocument);
  }

  // GET /files/:id/data
  static async getFile(request, response) {
    const idFile = request.params.id;
    if (!ObjectID.isValid(idFile)) return response.status(404).json({ error: 'Not found' });

    const fileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectID(idFile) });
    if (!fileDocument) return response.status(404).json({ error: 'Not found' });

    if (!fileDocument.isPublic) {
      const token = request.headers['x-token'];
      if (!token) return response.status(404).json({ error: 'Not found' });

      const keyID = await redisClient.get(`auth_${token}`);
      if (!keyID) return response.status(404).json({ error: 'Not found' });

      const user = await dbClient.db.collection('users').findOne({ _id: ObjectID(keyID) });
      if (!user || fileDocument.userId.toString() !== user._id.toString()) {
        return response.status(404).json({ error: 'Not found' });
      }
    }

    if (fileDocument.type === 'folder') {
      return response.status(400).json({ error: "A folder doesn't have content" });
    }

    const { localPath } = fileDocument;
    if (!fs.existsSync(localPath)) return response.status(404).json({ error: 'Not found' });

    const mimeType = mime.lookup(fileDocument.name);
    response.setHeader('Content-Type', mimeType);

    const fileContent = fs.readFileSync(localPath, 'utf-8');
    return response.send(fileContent);
  }
}

module.exports = FilesController;
