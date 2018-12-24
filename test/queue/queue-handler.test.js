/* eslint {no-unused-expressions: 0, max-nested-callbacks: 0, global-require: 0} */
const nock = require('nock');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const proxyquire = require('proxyquire');
const chai = require('chai');

const utils = require('../../src/lib/utils');
const projectData = require('../fixtures/jira-api-requests/project.json');
const JSONbody = require('../fixtures/webhooks/issue/created.json');
const getParsedAndSaveToRedis = require('../../src/jira-hook-parser');
const {cleanRedis} = require('../test-utils');
const createRoomStub = stub();

const {getRedisRooms, handleRedisRooms} = proxyquire('../../src/queue/redis-data-handle.js', {
    '../bot': {
        createRoom: createRoomStub,
    },
});

const {expect} = chai;
chai.use(sinonChai);

describe('Queue handler test', () => {
    let mclientStub;
    before(() => {
        nock(utils.getRestUrl(), {
            reqheaders: {
                Authorization: utils.auth(),
            },
        })
            .get(`/project/${projectData.id}`)
            .times(5)
            .reply(200, projectData);
    });

    afterEach(async () => {
        await cleanRedis();
    });

    after(() => {
        nock.cleanAll();
    });

    it('Room should not be created, room should be in redis', async () => {
        await getParsedAndSaveToRedis(JSONbody);
        const roomsKeys = await getRedisRooms();
        expect(roomsKeys).to.be.an('array').that.has.length(1);

        createRoomStub.throws('Incorrect room data');
        await handleRedisRooms(mclientStub, roomsKeys);
        const newRoomsKeys = await getRedisRooms();

        expect(newRoomsKeys).to.be.an('array').that.has.length(1);
        expect(newRoomsKeys).to.deep.equal(roomsKeys);
    });
});
