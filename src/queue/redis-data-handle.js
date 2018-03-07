const Ramda = require('ramda');
const logger = require('../modules/log.js')(module);
const redis = require('../redis-client.js');
const bot = require('../bot');

const ROOMS_KEY_NAME = 'rooms';
const {prefix} = require('../config').redis;

const getRedisKeys = async () => {
    try {
        const allKeys = await redis.keysAsync(`${prefix}*`);
        const redisKeys = allKeys.filter(key => !key.includes('|') && !key.includes('rooms'));

        return redisKeys;
    } catch (err) {
        throw ['getRedisKeys error', err].join('\n');
    }
};

const getRedisValue = async key => {
    try {
        const newKey = key.replace(prefix, '');

        const redisValue = await redis.getAsync(newKey);
        const parsedRedisValue = JSON.parse(redisValue);
        logger.debug(`Value from redis by key ${key}: `, parsedRedisValue);
        const result = redisValue ? {redisKey: newKey, ...parsedRedisValue} : false;

        return result;
    } catch (err) {
        logger.error('Error in getting value of key: ', key);

        return false;
    }
};

const getDataFromRedis = async () => {
    try {
        const allKeys = await getRedisKeys();
        const values = await Promise.all(allKeys.map(getRedisValue));
        const filteredValues = values.filter(Boolean);

        return filteredValues.length > 0 ? filteredValues : null;
    } catch (err) {
        logger.error('getDataFromRedis error');

        return null;
    }
};

const handleRedisData = async (client, dataFromRedis) => {
    try {
        if (!dataFromRedis) {
            logger.debug('No data from redis');

            return;
        }
        const result = await Promise.all(dataFromRedis.map(async ({redisKey, funcName, data}) => {
            try {
                const mclient = await client;

                await bot[funcName]({...data, mclient});
                await redis.delAsync(redisKey);

                return `${redisKey} --- true`;
            } catch (err) {
                logger.error(`Error in ${funcName}`, err);

                return `${redisKey} --- false`;
            }
        }));

        logger.info('Result of handling redis key', result);
    } catch (err) {
        logger.error('handleRedisData error', err);
    }
};

const getRedisRooms = async () => {
    try {
        const roomsKeyValue = await redis.getAsync(ROOMS_KEY_NAME);
        const createRoomData = JSON.parse(roomsKeyValue);
        logger.debug('Redis rooms data:', createRoomData);

        return createRoomData;
    } catch (err) {
        logger.error('getRedisRooms error');

        return null;
    }
};


const handleRedisRooms = async (client, roomsData) => {
    const roomHandle = async data => {
        try {
            const mclient = await client;
            await bot.createRoom({...data, mclient});

            return null;
        } catch (err) {
            logger.error('Error in handle room data from redis. Data is ', data);
            logger.error('Error log', err);

            return data;
        }
    };
    try {
        if (!roomsData) {
            logger.debug('No rooms from redis');

            return;
        }
        const handledRooms = await Promise.all(roomsData.map(roomHandle));
        const filteredRooms = handledRooms.filter(Boolean);
        if (filteredRooms.length > 0) {
            logger.warn('Rooms which not created', filteredRooms);

            const dataToSave = {
                redisKey: ROOMS_KEY_NAME,
                createRoomData: filteredRooms,
            };
            // eslint-disable-next-line
            await saveIncoming(dataToSave);
        } else {
            logger.info('All rooms handled');
            await redis.delAsync(ROOMS_KEY_NAME);
        }
    } catch (err) {
        logger.error('handleRedisRooms error', err);
    }
};


const saveIncoming = async ({redisKey, ...restData}) => {
    try {
        let redisValue = restData;
        if (redisKey === 'rooms') {
            const {createRoomData} = restData;
            if (!createRoomData) {
                return;
            }

            const dataToAddToRedis = Array.isArray(createRoomData) ? createRoomData : [createRoomData];
            logger.debug('New data for redis rooms:', dataToAddToRedis);

            const currentRedisRoomData = await getRedisRooms() || [];
            redisValue = Ramda.union(currentRedisRoomData, dataToAddToRedis);
        }

        const bodyToJSON = JSON.stringify(redisValue);

        await redis.setAsync(redisKey, bodyToJSON);
        logger.info('data saved by redis. RedisKey: ', redisKey);
    } catch (err) {
        throw ['Error while saving to redis:', err].join('\n');
    }
};

module.exports = {
    saveIncoming,
    getRedisKeys,
    getDataFromRedis,
    getRedisRooms,
    handleRedisData,
    handleRedisRooms,
    getRedisValue,
};