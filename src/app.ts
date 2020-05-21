import { config } from './config';
import { getChatClass } from './messengers';
import { commandsHandler } from './bot/commands';
import { FSM } from './fsm';
import { getServer } from './server';
import { queueHandler } from './queue';
import matrixSdk from 'matrix-js-sdk';
import * as matrixLogger from 'matrix-js-sdk/lib/logger';
import { getTaskTracker } from './task-trackers';
import { getLogger } from './modules/log';
import { MessengerApi, TaskTracker } from './types';

const logger = getLogger(module);

const ChatApi = getChatClass(config.messenger.name);
let sdk;
if (config.messenger.name === 'matrix') {
    const matrixSdkLogger = getLogger('matrix-SDK');

    matrixLogger.info = (...msg) => matrixSdkLogger.info(JSON.stringify(msg.join('\n')));
    matrixLogger.log = (...msg) => matrixSdkLogger.debug(JSON.stringify(msg.join('\n')));
    matrixLogger.warn = (...msg) => matrixSdkLogger.warn(JSON.stringify(msg.join('\n')));
    matrixLogger.error = (...msg) => matrixSdkLogger.error(JSON.stringify(msg.join('\n')));
    // matrixLogger.trace = (...msg) => matrixSdkLogger.trace(JSON.stringify(msg.join('\n')));

    sdk = matrixSdk;
}

const taskTracker = getTaskTracker(config);

/**
 * @type {import('./messengers/messenger-abstract')[]} chat instance
 */
const chatApiPool = config.messenger.bots.map(item => {
    return new ChatApi(commandsHandler, { ...item, ...config }, getLogger('messenger-api'), sdk);
});

const fsm = new FSM(
    (chatApiPool as any) as MessengerApi[],
    queueHandler((taskTracker as any) as TaskTracker),
    getServer,
    taskTracker,
    config.port,
);

fsm.start();

const onExit = err => {
    logger.warn('Jira Bot stopped ', err);
    fsm.stop();

    process.exit(1);
};

process.on('exit', onExit);
process.on('SIGINT', onExit);
process.on('uncaughtException', onExit);
