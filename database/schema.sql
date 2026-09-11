-- BrickStare PostgreSQL schema for Neon
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(40),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('customer','retailer','dispatcher','rider')),
  rider_status VARCHAR(20) DEFAULT 'Available' CHECK (rider_status IN ('Available','Busy')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(40) PRIMARY KEY,
  customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(40),
  address TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'New',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliveries (
  id VARCHAR(40) PRIMARY KEY,
  order_id VARCHAR(40) REFERENCES orders(id) ON DELETE SET NULL,
  retailer_email VARCHAR(255),
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(40),
  destination TEXT NOT NULL,
  item_description TEXT NOT NULL,
  delivery_date DATE,
  delivery_time TIME,
  notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  rider_id VARCHAR(40),
  package_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retailer_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  store_name VARCHAR(160) NOT NULL DEFAULT 'BrickStare Store',
  phone VARCHAR(40),
  notifications BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_rider ON deliveries(rider_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- Demo users. Demo password for all staff accounts: 12345678. Change before real production use.
INSERT INTO users (name,email,phone,password_hash,role,rider_status) VALUES
('BrickStare Retailer','retailer@brickstare.com','0711000000','scrypt$ZSi4zuul1AWwS6FGDmN_Kw$jTBYMNKRyg0mczh8AOotLWjRZFZafjVo5kXEkZttEt63iG0uacVk-SlREwYh7j6ylZvarfDhtgDTBRKLHe6G5A','retailer','Available'),
('Dispatcher 001','dispatcher001@gmail.com','0711000001','scrypt$06raroexUYNtUZicRCP-NQ$yNOkLXU7gLRnlgjvt7Xl-BeYJT8Ko65Nb2YOCKr_9yCNNEz_2khJXqAyDPYSetTnWUDnXr2Eu3DEyIBGe3momA','dispatcher','Available'),
('Brian Mwangi','rider001@gmail.com','0711000002','scrypt$JqqGdD3l8mwBTcky94FeGw$9pp6E-yB_Wk--ene5k2bp5a5-LliMh3CAw-x7tXHj6UiFOL22SBjGpDupQutAJZUV1PFaF5TEcjjOLPDRwngJw','rider' ,'Available'),
('Mercy Wanjiku','rider002@gmail.com','0711000003','scrypt$OVnCF3Xa2xEwtkz2jL33jg$lOOkkQ42bEa3EPhryTUsuAsRgMz0NOuSiquKJ5bkeP2bt9g-sEq_8rVvQAlsdZT5hv9ZbAW4ibzKBlWCBmz8Qw','rider','Available'),
('David Otieno','rider003@gmail.com','0711000004','scrypt$Jp5uNueN0GUg3uM1c5yA1A$eQ0KXFnyXoMqAgjXRRrwKV-MO7yUKquMtlrBz6bqT3xaHf2ZLFwiU_sEaSK4oVM7qHwVQcas1Jpo6GUx8d9RYA','rider','Available')
ON CONFLICT (email) DO NOTHING;

INSERT INTO products (id,name,category,description,price,stock,image) VALUES
('PRD-001','LED Smart TV 43-inch','Electronics','LED Smart TV 43-inch',32999,8,''),
('PRD-002','First Aid Kit','Pharmacy','Complete first aid kit',1850,16,''),
('PRD-003','Cordless Drill','Hardware','Cordless drill for home and workshop use',6400,6,'')
ON CONFLICT (id) DO NOTHING;

INSERT INTO orders (id,customer_name,customer_phone,address,items,total_amount,status) VALUES
('ORD-1001','Brian Mwangi','0712345678','Westlands, Nairobi','[{"productName":"LED Smart TV 43-inch","quantity":1}]',32999,'New'),
('ORD-1002','Mercy Wanjiku','0723456789','Kilimani, Nairobi','[{"productName":"First Aid Kit","quantity":2}]',3700,'New'),
('ORD-1003','David Otieno','0734567890','South B, Nairobi','[{"productName":"Cordless Drill","quantity":1},{"productName":"Tape Measure","quantity":1}]',6400,'New')
ON CONFLICT (id) DO NOTHING;

INSERT INTO retailer_settings (user_id,store_name,phone,notifications)
SELECT id,'BrickStare Store','',TRUE FROM users WHERE email='retailer@brickstare.com'
ON CONFLICT (user_id) DO NOTHING;
