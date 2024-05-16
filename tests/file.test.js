import {
  expect, use, should, request,
} from 'chai';
import chaiHttp from 'chai-http';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import app from '../server';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

use(chaiHttp);
should();

// File Endpoints

describe('testing File Endpoints', () => {
  let token = '';
  let userId = '';
  let fileId = '';

  before(async () => {
    await redisClient.client.flushall('ASYNC');
    await dbClient.usersCollection.deleteMany({});
    await dbClient.filesCollection.deleteMany({});
    const user = {
      email: 'bob@dylan.com',
      password: 'toto1234!',
    };
    const response = await request(app).post('/users').send(user);
    const body = JSON.parse(response.text);
    userId = body.id;
    token = (await request(app).get('/connect').auth(user.email, user.password)).body.token;
  });

  after(async () => {
    await redisClient.client.flushall('ASYNC');
    await dbClient.usersCollection.deleteMany({});
    await dbClient.filesCollection.deleteMany({});
  });

  // files
  describe('pOST /files', () => {
    it('uploads a new file', async () => {
      const fileContent = fs.readFileSync('./testFile', 'utf-8');
      const response = await request(app)
        .post('/files')
        .set('X-Token', token)
        .type('form')
        .attach('file', Buffer.from(fileContent), 'testFile');
      const body = JSON.parse(response.text);
      expect(body).to.have.property('id');
      fileId = body.id;
      expect(response.statusCode).to.equal(201);
    });

    it('fails to upload file because no token is provided', async () => {
      const fileContent = fs.readFileSync('./testFile', 'utf-8');
      const response = await request(app)
        .post('/files')
        .type('form')
        .attach('file', Buffer.from(fileContent), 'testFile');
      expect(response.statusCode).to.equal(401);
    });
  });

  describe('gET /files/:id', () => {
    it('retrieves a file based on its ID', async () => {
      const response = await request(app)
        .get(`/files/${fileId}`)
        .set('X-Token', token);
      const fileContent = fs.readFileSync('./testFile', 'utf-8');
      expect(response.text).to.equal(fileContent);
      expect(response.statusCode).to.equal(200);
    });

    it('fails to retrieve a file because the ID is invalid', async () => {
      const response = await request(app)
        .get('/files/invalidID')
        .set('X-Token', token);
      expect(response.statusCode).to.equal(404);
    });

    it('fails to retrieve a file because no token is provided', async () => {
      const response = await request(app).get(`/files/${fileId}`);
      expect(response.statusCode).to.equal(401);
    });
  });

  // Pagination
  describe('gET /files', () => {
    it('retrieves a list of files with pagination', async () => {
      const response = await request(app)
        .get('/files')
        .set('X-Token', token)
        .query({ page: 1 });
      expect(response.body).to.be.an('array');
      expect(response.statusCode).to.equal(200);
    });

    it('fails to retrieve files because no token is provided', async () => {
      const response = await request(app).get('/files');
      expect(response.statusCode).to.equal(401);
    });
  });

  describe('pUT /files/:id/publish', () => {
    it('publishes a file', async () => {
      const response = await request(app)
        .put(`/files/${fileId}/publish`)
        .set('X-Token', token);
      expect(response.statusCode).to.equal(200);
    });

    it('fails to publish a file because the ID is invalid', async () => {
      const response = await request(app)
        .put('/files/invalidID/publish')
        .set('X-Token', token);
      expect(response.statusCode).to.equal(404);
    });

    it('fails to publish a file because no token is provided', async () => {
      const response = await request(app).put(`/files/${fileId}/publish`);
      expect(response.statusCode).to.equal(401);
    });
  });

  describe('pUT /files/:id/unpublish', () => {
    it('unpublishes a file', async () => {
      const response = await request(app)
        .put(`/files/${fileId}/unpublish`)
        .set('X-Token', token);
      expect(response.statusCode).to.equal(200);
    });

    it('fails to unpublish a file because the ID is invalid', async () => {
      const response = await request(app)
        .put('/files/invalidID/unpublish')
        .set('X-Token', token);
      expect(response.statusCode).to.equal(404);
    });

    it('fails to unpublish a file because no token is provided', async () => {
      const response = await request(app).put(`/files/${fileId}/unpublish`);
      expect(response.statusCode).to.equal(401);
    });
  });

  describe('gET /files/:id/data', () => {
    it('retrieves metadata of a file', async () => {
      const response = await request(app)
        .get(`/files/${fileId}/data`)
        .set('X-Token', token);
      const { body } = response;
      expect(body).to.have.property('userId');
      expect(body).to.have.property('fileId');
      expect(response.statusCode).to.equal(200);
    });

    it('fails to retrieve metadata of a file because the ID is invalid', async () => {
      const response = await request(app)
        .get('/files/invalidID/data')
        .set('X-Token', token);
      expect(response.statusCode).to.equal(404);
    });

    it('fails to retrieve metadata of a file because no token is provided', async () => {
      const response = await request(app).get(`/files/${fileId}/data`);
      expect(response.statusCode).to.equal(401);
    });
  });
});
