import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  const res = await pool.query('SELECT order_id, order_number, customer_name, customer_phone, delivery_area, delivery_address, status, total_amount, notification_status, consent_given FROM orders WHERE order_number = $1', ['MN-20260912-9725']);
  console.log('Postgres Query Result for MN-20260912-9725:');
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

check().catch(console.error);
