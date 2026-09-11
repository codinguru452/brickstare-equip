import os
import json
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.rows import dict_row
from flask import Flask, jsonify, request, make_response, send_from_directory
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

app = Flask(__name__)

SESSION_COOKIE = "brickstare_session"
SESSION_SECRET = os.getenv("SESSION_SECRET", "brickstare-dev-secret")


def db_connect():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not configured. Add it to your .env file locally or Vercel Environment Variables.")
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=10)


def query(sql, params=(), fetch="all"):
    with db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            if fetch == "one":
                return cur.fetchone()
            if fetch == "all":
                return cur.fetchall()
            return None


def execute_returning(sql, params=()):
    with db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        conn.commit()
        return row


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def json_body():
    return request.get_json(silent=True) or {}


def hash_password(password):
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return "scrypt${}${}".format(
        base64.urlsafe_b64encode(salt).decode().rstrip("="),
        base64.urlsafe_b64encode(derived).decode().rstrip("=")
    )


def verify_password(password, stored):
    try:
        _, salt_b64, expected_b64 = stored.split("$")
        salt = base64.urlsafe_b64decode(salt_b64 + "=" * (-len(salt_b64) % 4))
        expected = base64.urlsafe_b64decode(expected_b64 + "=" * (-len(expected_b64) % 4))
        actual = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def token_for(user):
    payload = {
        "id": user["id"],
        "role": user["role"],
        "exp": int((datetime.now(timezone.utc) + timedelta(days=1)).timestamp()),
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(SESSION_SECRET.encode(), raw.encode(), hashlib.sha256).digest()
    return raw + "." + base64.urlsafe_b64encode(sig).decode().rstrip("=")


def user_from_token():
    token = request.cookies.get(SESSION_COOKIE)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        return None
    try:
        raw, sig = token.split(".", 1)
        expected = hmac.new(SESSION_SECRET.encode(), raw.encode(), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(sig + "=" * (-len(sig) % 4))
        if not hmac.compare_digest(expected, supplied):
            return None
        data = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
        if data.get("exp", 0) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return data
    except Exception:
        return None


def require_role(*roles):
    user = user_from_token()
    if not user:
        return None, (jsonify(message="Authentication required."), 401)
    if roles and user.get("role") not in roles:
        return None, (jsonify(message="You do not have permission for this action."), 403)
    return user, None


def rider_code(email):
    import re
    match = re.search(r"rider(\d{3})@", str(email or ""), re.I)
    return f"RIDER-{match.group(1)}" if match else None


def delivery_dto(row):
    return {
        "id": row["id"], "orderId": row["order_id"], "retailerEmail": row["retailer_email"],
        "customerName": row["customer_name"], "customerPhone": row["customer_phone"],
        "destination": row["destination"], "itemDescription": row["item_description"],
        "deliveryDate": row["delivery_date"].isoformat() if row.get("delivery_date") else None,
        "deliveryTime": row["delivery_time"].isoformat() if row.get("delivery_time") else None,
        "notes": row["notes"], "status": row["status"], "riderId": row["rider_id"],
        "packageVerified": row["package_verified"], "statusHistory": row.get("status_history") or [],
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
        "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None,
        "riderName": row.get("rider_name"),
    }


def order_dto(row):
    return {
        "id": row["id"], "customerName": row["customer_name"], "phone": row["customer_phone"],
        "address": row["address"], "items": row.get("items") or [],
        "totalAmount": float(row["total_amount"] or 0), "status": row["status"],
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
        "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


def notify_user(email, title, message):
    user = query("SELECT id FROM users WHERE lower(email)=lower(%s) LIMIT 1", (email,), "one")
    if user:
        query("INSERT INTO notifications(user_id,title,message) VALUES(%s,%s,%s)", (user["id"], title, message), "none")


@app.get("/api")
@app.get("/api/health")
def health():
    return jsonify(ok=True, service="BrickStare API", time=now_iso())


@app.post("/api/login")
def login():
    body = json_body()
    email, password = body.get("email", "").strip(), body.get("password", "")
    if not email or not password:
        return jsonify(message="Email and password are required."), 400
    user = query("SELECT id,name,email,phone,password_hash,role FROM users WHERE lower(email)=lower(%s) LIMIT 1", (email,), "one")
    if not user or not verify_password(password, user["password_hash"]):
        return jsonify(message="Invalid email or password."), 401
    token = token_for(user)
    response = make_response(jsonify(success=True, token=token, user={k: user[k] for k in ("id", "name", "email", "phone", "role")}))
    response.set_cookie(SESSION_COOKIE, token, max_age=86400, httponly=True, secure=bool(request.is_secure or os.getenv("VERCEL_ENV")), samesite="Lax", path="/")
    return response


@app.route("/api/logout", methods=["GET", "POST"])
def logout():
    response = make_response(jsonify(success=True))
    response.set_cookie(SESSION_COOKIE, "", max_age=0, httponly=True, secure=bool(request.is_secure or os.getenv("VERCEL_ENV")), samesite="Lax", path="/")
    return response


@app.get("/api/me")
def me():
    user, error = require_role()
    if error:
        return error
    row = query("SELECT id,name,email,phone,role FROM users WHERE id=%s LIMIT 1", (user["id"],), "one")
    return jsonify(user=row)


@app.post("/api/register")
def register():
    body = json_body()
    name, email, password = body.get("name", "").strip(), body.get("email", "").strip(), body.get("password", "")
    phone = body.get("phone")
    if not name or not email or not password:
        return jsonify(message="Name, email and password are required."), 400
    if len(password) < 8:
        return jsonify(message="Password must contain at least 8 characters."), 400
    if query("SELECT id FROM users WHERE lower(email)=lower(%s) LIMIT 1", (email,), "one"):
        return jsonify(message="An account with that email already exists."), 409
    user = execute_returning("INSERT INTO users(name,email,phone,password_hash,role) VALUES(%s,%s,%s,%s,'customer') RETURNING id,name,email,phone,role", (name, email, phone or None, hash_password(password)))
    token = token_for(user)
    response = make_response(jsonify(success=True, token=token, user=user), 201)
    response.set_cookie(SESSION_COOKIE, token, max_age=86400, httponly=True, secure=bool(request.is_secure or os.getenv("VERCEL_ENV")), samesite="Lax", path="/")
    return response


@app.get("/api/products")
def products():
    rows = query("SELECT id,name,category,description,price,stock,image,created_at,updated_at FROM products ORDER BY created_at DESC")
    return jsonify(products=[{**p, "price": float(p["price"]), "stock": int(p["stock"])} for p in rows])


@app.get("/api/inventory")
def inventory_get():
    user, error = require_role("retailer")
    if error:
        return error
    rows = query("SELECT id,name,category,description,price,stock,image FROM products ORDER BY created_at DESC")
    return jsonify(products=[{**p, "price": float(p["price"]), "stock": int(p["stock"])} for p in rows])


@app.post("/api/inventory")
def inventory_post():
    user, error = require_role("retailer")
    if error:
        return error
    body = json_body()
    if not body.get("name") or body.get("price") is None or body.get("stock") is None:
        return jsonify(message="Name, price and stock are required."), 400
    product_id = "PRD-" + str(int(datetime.now().timestamp() * 1000))[-8:]
    row = execute_returning("INSERT INTO products(id,name,category,description,price,stock,image) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *", (product_id, body["name"], body.get("category"), body.get("description"), float(body["price"]), int(body["stock"]), body.get("image")))
    row["price"], row["stock"] = float(row["price"]), int(row["stock"])
    return jsonify(product=row), 201


@app.route("/api/orders", methods=["GET", "POST"])
def orders():
    user, error = require_role("customer", "retailer", "dispatcher", "rider")
    if error:
        return error
    if request.method == "GET":
        if user["role"] == "customer":
            rows = query("SELECT * FROM orders WHERE customer_id=%s ORDER BY created_at DESC", (user["id"],))
        else:
            rows = query("SELECT * FROM orders ORDER BY created_at DESC")
        return jsonify(orders=[order_dto(r) for r in rows])
    if user["role"] != "customer":
        return jsonify(message="Only customers can create orders."), 403
    body = json_body()
    items = body.get("items")
    if not isinstance(items, list) or not items:
        return jsonify(message="Your order must contain at least one item."), 400
    ids = [i.get("productId") for i in items if i.get("productId")]
    products_by_id = {}
    if ids:
        rows = query("SELECT id,name,price,stock FROM products WHERE id = ANY(%s)", (ids,))
        products_by_id = {p["id"]: p for p in rows}
    normalized = []
    for item in items:
        p = products_by_id.get(item.get("productId"))
        normalized.append({"productId": item.get("productId"), "productName": item.get("productName") or (p["name"] if p else "Product"), "quantity": int(item.get("quantity") or 1), "price": float(item.get("price") if item.get("price") is not None else (p["price"] if p else 0))})
    total = sum(i["price"] * i["quantity"] for i in normalized)
    customer = query("SELECT name,phone FROM users WHERE id=%s", (user["id"],), "one")
    order_id = "ORD-" + str(int(datetime.now().timestamp() * 1000))[-8:]
    row = execute_returning("INSERT INTO orders(id,customer_id,customer_name,customer_phone,address,items,total_amount,status) VALUES(%s,%s,%s,%s,%s,%s,%s,'New') RETURNING *", (order_id, user["id"], customer["name"], body.get("phone") or customer["phone"], body.get("address"), json.dumps(normalized), total))
    return jsonify(order=order_dto(row)), 201


@app.get("/api/users/riders")
def riders():
    user, error = require_role("dispatcher", "retailer")
    if error:
        return error
    rows = query("SELECT id,name,email,phone,rider_status FROM users WHERE role='rider' ORDER BY id")
    return jsonify(riders=[{"id": rider_code(r["email"]), "name": r["name"], "email": r["email"], "phone": r["phone"], "status": r["rider_status"]} for r in rows])


@app.route("/api/deliveries", methods=["GET", "POST"])
def deliveries():
    user, error = require_role("retailer", "dispatcher", "rider")
    if error:
        return error
    if request.method == "GET":
        if user["role"] == "rider":
            code = rider_code(query("SELECT email FROM users WHERE id=%s", (user["id"],), "one")["email"])
            rows = query("SELECT d.*,u.name AS rider_name FROM deliveries d LEFT JOIN users u ON u.role='rider' AND u.email=REPLACE(d.rider_id,'RIDER-','rider') || '@gmail.com' WHERE d.rider_id=%s ORDER BY d.created_at DESC", (code,))
        else:
            rows = delivery_rows_for_all()
        return jsonify(deliveries=[delivery_dto(r) for r in rows])
    if user["role"] != "retailer":
        return jsonify(message="Only retailers can create delivery requests."), 403
    body = json_body()
    required = ["customerName", "customerPhone", "destination", "itemDescription", "deliveryDate", "deliveryTime"]
    if any(not body.get(k) for k in required):
        return jsonify(message="Please fill in all required delivery fields."), 400
    delivery_id = "DEL-" + str(int(datetime.now().timestamp() * 1000))[-8:]
    row = execute_returning("INSERT INTO deliveries(id,order_id,retailer_email,customer_name,customer_phone,destination,item_description,delivery_date,delivery_time,notes,status,status_history) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Pending',%s) RETURNING *", (delivery_id, body.get("orderId") or None, user_email(user), body["customerName"], body["customerPhone"], body["destination"], body["itemDescription"], body["deliveryDate"], body["deliveryTime"], body.get("notes"), json.dumps([{"status": "Pending", "timestamp": now_iso()}])))
    if body.get("orderId"):
        query("UPDATE orders SET status='Processing',updated_at=NOW() WHERE id=%s", (body["orderId"],), "none")
    return jsonify(delivery=delivery_dto(row)), 201


def user_email(user):
    row = query("SELECT email FROM users WHERE id=%s", (user["id"],), "one")
    return row["email"] if row else ""


def delivery_rows_for_all():
    return query("SELECT d.*,u.name AS rider_name FROM deliveries d LEFT JOIN users u ON u.role='rider' AND u.email=REPLACE(d.rider_id,'RIDER-','rider') || '@gmail.com' ORDER BY d.created_at DESC")


@app.get("/api/deliveries/<delivery_id>")
def delivery_detail(delivery_id):
    user, error = require_role("retailer", "dispatcher", "rider")
    if error:
        return error
    row = query("SELECT d.*,u.name AS rider_name FROM deliveries d LEFT JOIN users u ON u.role='rider' AND u.email=REPLACE(d.rider_id,'RIDER-','rider') || '@gmail.com' WHERE d.id=%s", (delivery_id,), "one")
    if not row:
        return jsonify(message="Delivery not found."), 404
    if user["role"] == "rider" and row["rider_id"] != rider_code(user_email(user)):
        return jsonify(message="This delivery is not assigned to you."), 403
    return jsonify(delivery=delivery_dto(row))


@app.route("/api/deliveries/<delivery_id>/assign", methods=["PATCH"])
def assign_delivery(delivery_id):
    user, error = require_role("dispatcher")
    if error:
        return error
    body = json_body()
    rider_id = body.get("riderId")
    if not rider_id:
        return jsonify(message="riderId is required."), 400
    rider = query("SELECT id,name,email FROM users WHERE role='rider'", ())
    match = next((r for r in rider if rider_code(r["email"]) == rider_id), None)
    if not match:
        return jsonify(message="Rider not found."), 404
    row = query("SELECT * FROM deliveries WHERE id=%s", (delivery_id,), "one")
    if not row:
        return jsonify(message="Delivery not found."), 404
    history = row["status_history"] or []
    history.append({"status": "Assigned", "timestamp": now_iso()})
    updated = execute_returning("UPDATE deliveries SET rider_id=%s,status='Assigned',status_history=%s,updated_at=NOW() WHERE id=%s RETURNING *", (rider_id, json.dumps(history), delivery_id))
    query("UPDATE users SET rider_status='Busy' WHERE id=%s", (match["id"],), "none")
    notify_user(row["retailer_email"], "Rider assigned", f"{delivery_id} has been assigned to a rider.")
    return jsonify(delivery=delivery_dto(updated))


@app.route("/api/deliveries/<delivery_id>/status", methods=["PATCH"])
def update_delivery_status(delivery_id):
    user, error = require_role("rider", "dispatcher", "retailer")
    if error:
        return error
    status = json_body().get("status")
    allowed = ["Pending", "Assigned", "Picked Up", "Delivered"]
    if status not in allowed:
        return jsonify(message="Invalid delivery status."), 400
    row = query("SELECT * FROM deliveries WHERE id=%s", (delivery_id,), "one")
    if not row:
        return jsonify(message="Delivery not found."), 404
    if user["role"] == "rider" and row["rider_id"] != rider_code(user_email(user)):
        return jsonify(message="This delivery is not assigned to you."), 403
    if status == "Delivered" and not row["package_verified"]:
        return jsonify(message="Package verification is required before marking the delivery as Delivered."), 400
    history = row["status_history"] or []
    history.append({"status": status, "timestamp": now_iso()})
    updated = execute_returning("UPDATE deliveries SET status=%s,status_history=%s,updated_at=NOW() WHERE id=%s RETURNING *", (status, json.dumps(history), delivery_id))
    if status == "Delivered" and row["rider_id"]:
        email = row["rider_id"].replace("RIDER-", "rider") + "@gmail.com"
        query("UPDATE users SET rider_status='Available' WHERE email=%s", (email,), "none")
    notify_user(row["retailer_email"], "Delivery updated", f"{delivery_id} is now {status}.")
    return jsonify(delivery=delivery_dto(updated))


@app.post("/api/deliveries/<delivery_id>/verify")
def verify_delivery(delivery_id):
    user, error = require_role("rider")
    if error:
        return error
    package_id = str(json_body().get("packageId", "")).strip()
    row = query("SELECT * FROM deliveries WHERE id=%s", (delivery_id,), "one")
    if not row:
        return jsonify(message="Delivery not found."), 404
    if row["rider_id"] != rider_code(user_email(user)):
        return jsonify(message="This delivery is not assigned to you."), 403
    if package_id not in {row["id"], row["order_id"]}:
        return jsonify(message="Package ID does not match this delivery."), 400
    updated = execute_returning("UPDATE deliveries SET package_verified=TRUE,updated_at=NOW() WHERE id=%s RETURNING *", (delivery_id,))
    return jsonify(success=True, packageVerified=True, delivery=delivery_dto(updated))


@app.get("/api/notifications")
def notifications():
    user, error = require_role("retailer", "customer", "dispatcher", "rider")
    if error:
        return error
    rows = query("SELECT id,title,message,is_read,created_at FROM notifications WHERE user_id=%s ORDER BY created_at DESC", (user["id"],))
    return jsonify(notifications=[{"id": n["id"], "title": n["title"], "message": n["message"], "isRead": n["is_read"], "time": n["created_at"].isoformat()} for n in rows])


@app.get("/api/settings")
def settings_get():
    user, error = require_role("retailer")
    if error:
        return error
    row = query("SELECT store_name,phone,notifications FROM retailer_settings WHERE user_id=%s", (user["id"],), "one")
    row = row or {"store_name": "BrickStare Store", "phone": "", "notifications": True}
    return jsonify(settings={"storeName": row["store_name"], "phone": row["phone"] or "", "email": user_email(user), "notifications": row["notifications"]})


@app.patch("/api/settings")
def settings_patch():
    user, error = require_role("retailer")
    if error:
        return error
    body = json_body()
    row = execute_returning("INSERT INTO retailer_settings(user_id,store_name,phone,notifications) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET store_name=EXCLUDED.store_name,phone=EXCLUDED.phone,notifications=EXCLUDED.notifications,updated_at=NOW() RETURNING store_name,phone,notifications", (user["id"], body.get("storeName") or "BrickStare Store", body.get("phone") or None, body.get("notifications") is not False))
    return jsonify(settings={"storeName": row["store_name"], "phone": row["phone"] or "", "email": user_email(user), "notifications": row["notifications"]})



# ============================================================
# FRONTEND PAGE ROUTES
# ============================================================

@app.get("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")

@app.get("/shop")
def shop():
    return send_from_directory(BASE_DIR, "shop.html")

@app.get("/about")
def about():
    return send_from_directory(BASE_DIR, "about.html")

@app.get("/contact")
def contact():
    return send_from_directory(BASE_DIR, "contact.html")

@app.get("/cart")
def cart():
    return send_from_directory(BASE_DIR, "cart.html")

@app.get("/checkout")
def checkout():
    return send_from_directory(BASE_DIR, "checkout.html")

@app.get("/thankyou")
def thankyou():
    return send_from_directory(BASE_DIR, "thankyou.html")

@app.get("/auth/auth.html")
def auth_page():
    return send_from_directory(os.path.join(BASE_DIR, "auth"), "auth.html")

@app.get("/<path:filename>")
def serve_frontend_file(filename):
    file_path = os.path.join(BASE_DIR, filename)
    if os.path.isfile(file_path):
        return send_from_directory(BASE_DIR, filename)
    return jsonify(message="Page not found."), 404


@app.errorhandler(Exception)
def handle_error(exc):
    app.logger.exception(exc)
    detail = str(exc) if app.debug else None
    return jsonify(message="BrickStare API error.", detail=detail), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=True)
