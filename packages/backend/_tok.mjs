import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { connectToDb, client } from './src/db/connection.js';
const db = await connectToDb();
const u = await db.collection('users').findOne({ email: 'ashar050488@gmail.com' });
console.log(JSON.stringify({ token: jwt.sign({ id: String(u._id ?? u.id), role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' }), id: String(u._id), name: u.name }));
await client.close();
