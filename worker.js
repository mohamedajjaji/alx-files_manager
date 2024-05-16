import Queue from 'bull';
import { ObjectID } from 'mongodb';
import imageThumbnail from 'image-thumbnail';
import fs from 'fs';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue');

fileQueue.process(async (job, done) => {
  const { userId, fileId, localPath } = job.data;

  if (!fileId) {
    done(new Error('Missing fileId'));
    return;
  }

  if (!userId) {
    done(new Error('Missing userId'));
    return;
  }

  try {
    const fileDocument = await dbClient.db.collection('files').findOne({ _id: ObjectID(fileId), userId: ObjectID(userId) });
    if (!fileDocument) {
      done(new Error('File not found'));
      return;
    }

    const sizes = [500, 250, 100];
    const thumbnailPromises = sizes.map(async (size) => {
      const thumbnail = await imageThumbnail(localPath, { width: size });
      const thumbnailPath = `${localPath}_${size}`;
      fs.writeFileSync(thumbnailPath, thumbnail);
    });

    await Promise.all(thumbnailPromises);

    done();
  } catch (error) {
    done(error);
  }
});
