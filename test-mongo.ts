import 'dotenv/config';
import dns from 'node:dns';
import mongoose from 'mongoose';

dns.setServers(['1.1.1.1', '8.8.8.8']);

async function testMongo() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ MONGODB_URI is not loaded');
    process.exit(1);
  }

  console.log('Node DNS servers:', dns.getServers());

  const safeUri = uri.replace(
    /:\/\/([^:]+):([^@]+)@/,
    '://$1:****@'
  );

  console.log('MONGODB_URI loaded');
  console.log('URI:', safeUri);

  try {
    console.log('Connecting to MongoDB...');

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    console.log('✅ MongoDB connection SUCCESS');
    console.log('Database:', mongoose.connection.name);
    console.log('Host:', mongoose.connection.host);

    await mongoose.disconnect();

    console.log('✅ MongoDB disconnect SUCCESS');
    process.exit(0);
  } catch (error) {
    console.error('❌ MongoDB connection FAILED');

    if (error instanceof Error) {
      console.error('Error:', error.message);
      console.error('Name:', error.name);
      console.error('Stack:', error.stack);
    } else {
      console.error(error);
    }

    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

testMongo();