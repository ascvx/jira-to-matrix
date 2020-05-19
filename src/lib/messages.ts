const getMessage = obj =>
    Object.entries(obj)
        .map(([key, val]) => `${key}: ${val}`)
        .join(', ');

export const infoBody = `
    <br>
    Use <font color="green"><strong>!help</strong></font> in chat for give info for jira commands
    `;

export const noJiraConnection = 'No connection with Jira!!!';

export const getRequestErrorLog = (url, status, { method, body } = { method: 'GET' }) =>
    `Error in ${method} request ${url}, status is ${status}, body is ${body}`;

export const getNoIssueLinkLog = (id1, id2) =>
    `Cannot get no one issue to info about deleting link with issues: ${id1} ${id2}`;

export const getWebhookStatusLog = ({ projectStatus }) => `${getMessage(projectStatus)}`;
