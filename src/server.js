const express = require('express');
const logger = require('winston');
const yaml = require('js-yaml');
const fs = require('fs');
const bodyParser = require('body-parser');

logger.level = process.env.LOG_LEVEL || 'info';

let splitPath;
if (__dirname.includes('/src')) {
    splitPath = __dirname.split('/src');
}
else {
    splitPath = __dirname.split('/build/backend');
}
const [rootPath] = splitPath;

const app = express();
app.use(bodyParser.json());
const { functions } = yaml.safeLoad(fs.readFileSync(`${rootPath}/serverless.yml`, 'utf8'));

if (!process.env.DISABLE_STATIC_CONTENT) {
    app.use(express.static(`${__dirname}/../client/public`));
}

const handlerFunctions = mapHandlerFunctions(functions);

function mapHandlerFunctions(functions) {
    const handlerFunctions = {}; 
    for (const key in functions) {
        const { handler } = functions[key];
        if (!handler) {
            throw new Error(`Invalid function handler definition for ${key}`);
        }
        const [handlerFile, handlerName] = handler.split('.');
        const [, serverlessPath] = handlerFile.split('Serverless');
        handlerFunctions[key] = require(`./Serverless${serverlessPath}`)[handlerName];
    }

    return handlerFunctions;
}

function buildLambdaEvent(req) {
    const { headers, body, url, method, query, params } = req;
    return {
        headers,
        body: JSON.stringify(body),
        path: url,
        httpMethod: method,
        queryStringParameters: query,
        pathParameters: params,
        authorizationToken: headers.authorization
    };
}

function httpHandlerWrapper(func) {
    return (req, res) => {
        const lambdaEvent = buildLambdaEvent(req);

        func(lambdaEvent, null, (err, response)=>{

            if (err) {
                logger.error(err);
                return res.status(500).send('Unexpected Error! Try Again.');
            }
            const {statusCode, body, headers} = response;
            res.status(statusCode);
            if (headers) {
                for (const key in headers) {
                    res.set(key, headers[key]);
                }
            }
            else {
                res.set('Content-type', 'application/json');
            }
            res.send(body);
        });
    };
}

function authorizerWrapper(func) {
    return (req, res, next) => {
        const lambdaEvent = buildLambdaEvent(req);
        func(lambdaEvent, null, (_, policy)=>{
            const {
                policyDocument: {
                    Statement: [statement]
                }
            } = policy;
            if (statement.Effect === 'Allow') {
                return next();
            }
            res.status(403).json({Message: 'User is not authorized to access this resource'});
        });
    };
}

for (const key in functions) {
    const { events } = functions[key];
    
    if (events) {
        for (const event of events) {
            const { http } = event;
            if (http) {
                const { method = 'all', path, authorizer } = http;
                
                if (authorizer) {
                    app[method](
                        `/${path}`, 
                        authorizerWrapper(handlerFunctions[authorizer]), 
                        httpHandlerWrapper(handlerFunctions[key])
                    );
                }
                else {
                    app[method](`/${path}`, httpHandlerWrapper(handlerFunctions[key]));
                    
                }
                logger.info(`Route configured => Path: /${path}, ` +
                    `Method: ${method.toUpperCase()}, ` +
                    `Handler: ${key}, ` +
                    `Authorizer: ${authorizer || 'public'}`);
            } 
        }
    }
}

const port = process.env.PORT || 3000;
app.listen(port, ()=>{
    logger.info(`Listening on http://localhost:${port}`);
});