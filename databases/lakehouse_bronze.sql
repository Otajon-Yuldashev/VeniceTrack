-- Create Bronze schema
CREATE SCHEMA bronze;

-- Bronze vessels table (raw AIS data - created by Eventstream)
CREATE TABLE bronze.vessels (
    mmsi VARCHAR(20),
    ship_name VARCHAR(100),
    latitude FLOAT,
    longitude FLOAT,
    sog FLOAT,
    cog FLOAT,
    true_heading INT,
    rate_of_turn INT,
    nav_status INT,
    ship_type_code INT,
    ship_type_name VARCHAR(50),
    destination VARCHAR(100),
    call_sign VARCHAR(20),
    imo BIGINT,
    draught FLOAT,
    length INT,
    width INT,
    eta_month INT,
    eta_day INT,
    eta_hour INT,
    eta_minute INT,
    timestamp VARCHAR(20)
);
