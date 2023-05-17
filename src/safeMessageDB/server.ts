import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { messageDBConnect } from './messageDBConnect';
import { spawn } from 'child_process';
import {
  safeJSONProps as sjp,
  getConfigProp,
  safeConfigPath as scp,
} from '../safeUtil/Util';
import xss from 'xss';

import Code from '../safeUtil/generateCode';
import { checkString } from './verifyString';

// Create a new Express app
const app = express();
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(cors());

// Define an endpoint for retrieving all events
app.get('/getallmessages', async (req: Request, res: Response) => {
  try {
    // Acquire a client connection from the connection pool
    const client = await messageDBConnect.connect();

    // Execute a SQL query to retrieve all events
    const result = await client.query(
      'SELECT * FROM "Message";',
    );
    if (result.rows.length === 0) {
      res
        .status(404)
        .json({ error: 'No messages in database' });
    } else {
      res.status(200).json(result.rows[0]);
    }
    // Release the client connection back to the pool
    client.release();
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: 'Internal server error, please try back later' });
  }
});

// Define an endpoint for deleting a message
app.delete('/deletemessage', async (req: Request, res: Response) => {
  const { code } = req.query;

  try {
    // Acquire a client connection from the connection pool
    const client = await messageDBConnect.connect();

    // Execute a SQL query to retrieve all events
    const result = await client.query(
      'DELETE FROM "Message" WHERE code = $1;',
      [code]
    );
    if (result.rows.length === 0) {
      res
        .status(404)
        .json({ error: 'No matching record found with provided code' });
    } else {
      res.status(200).json(result.rows[0]);
    }
    // Release the client connection back to the pool
    client.release();
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: 'Internal server error, please try back later' });
  }
});

// Define an endpoint for retrieving all events
app.get('/getmessage', async (req: Request, res: Response) => {
  const { code } = req.query;

  try {
    // Acquire a client connection from the connection pool
    const client = await messageDBConnect.connect();

    // Execute a SQL query to retrieve all events
    const result = await client.query(
      'SELECT message, message_reply FROM "Message" WHERE code = $1;',
      [code]
    );
    if (result.rows.length === 0) {
      res
        .status(404)
        .json({ error: 'No matching record found with provided code' });
    } else {
      res.status(200).json(result.rows[0]);
    }
    // Release the client connection back to the pool
    client.release();
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: 'Internal server error, please try back later' });
  }
});

app.post('/addReply', async (req: Request, res: Response) => {
  const { code, reply } = req.body;

  try {
    // Acquire a client connection from the connection pool
    const client = await messageDBConnect.connect();
    // Execute a SQL query to insert a new event
    await client.query(
      'UPDATE "Message" SET message_reply = $1 WHERE code = $2;',
      [reply, code]
    );
    // Release the client connection back to the pool
    await client.release();

    res.status(200); //we use this to test if user can get back the code from server
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/setReply', async (req: Request, res: Response) => {
  const { code } = req.body;

  try {
    // Acquire a client connection from the connection pool
    const client = await messageDBConnect.connect();
    // Execute a SQL query to insert a new event
    await client.query(
      'UPDATE "Message" SET receive_reply = true WHERE code = $1',
      [code]
    );
    // Release the client connection back to the pool
    await client.release();

    res.status(200); //we use this to test if user can get back the code from server
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/receiverEmail', async (req: Request, res: Response) => {
  const { email, code } = req.body;

  try {
    // Send notification email to receiver
    const mailArgs = [`-s SAFE- This is a copy of your Code`, email];
    const mail = spawn('mail', mailArgs);
    mail.stdin.write(
      `Here is a copy of your unqiue code: ${code} \n please check back later in the website with reply. https://feedback.cs.pdx.edu`
    );
    mail.stdin.end();

    res.status(200).send(`Your code had been sent to the email you provied`); //we use this to test if user can get back the code from server
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Define an endpoint for adding a new event
app.post('/addMessage', async (req: Request, res: Response) => {
  const {
    title,
    receiver_name,
    message,
    receive_reply,
    has_been_read,
    message_reply,
  } = req.body;

  // Sanitize all properties of the req.body object
  const sanitizedBody = {
    title: xss(title),
    message: xss(message),
    message_reply: xss(message_reply),
  };
  const sanitizedTitle = sanitizedBody.title.replace(/[^a-zA-Z0-9\s\/]/g, '');
  let result: number | null = null;
  try{
    result = checkString(message);
  }catch (e: any){
    return res
      .status(400)
      .json({ error: e.message });
  }
  let analysis_result: string | null = null;
  if (result < 0) {
    analysis_result = 'negative';
  } else if (result === 0) {
    analysis_result = 'neutral';
  } else if (result > 0) {
    analysis_result = 'positive';
  } else {
    analysis_result = 'unknown';
  }

  try {
    // Acquire a client connection from the connection pool
    const client = await messageDBConnect.connect();
    const msg_code = await Code.genCode(client);
    // Execute a SQL query to insert a new event
    await client.query(
      'INSERT INTO "Message" (title, receiver_name, message, code, receive_reply, has_been_read, time_submitted, message_reply, sentiment_analysis) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        sanitizedTitle,
        receiver_name,
        sanitizedBody.message,
        msg_code,
        receive_reply,
        has_been_read,
        new Date(),
        sanitizedBody.message_reply,
        analysis_result,
      ]
    );
    // Release the client connection back to the pool
    await client.release();

    // Send notification email to receiver
    const mailArgs = [
      `-s SAFE: "${sanitizedTitle}"`,
      getConfigProp(sjp.rcvr_email, scp),
    ];
    const mail = spawn('mail', mailArgs);
    mail.stdin.write(sanitizedBody.message);
    mail.stdin.end();
    // res.status(200).send();
    res.status(200).send(`${msg_code}`); //we use this to test if user can get back the code from server
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(3004, '131.252.208.28', () => {
  console.log(`Server listening on port 3001`);
});

export default app;
