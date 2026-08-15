"""Print short-lived UI automation context for Phase 1 role tests."""
from datetime import datetime, timedelta, timezone
import json

import jwt
from dotenv import dotenv_values
from pymongo import MongoClient

ENV = dotenv_values("/app/backend/.env")
INSTITUTE_ID = "42c4f12d-97d3-4879-ad93-50b3dd82bae8"
client = MongoClient(ENV["MONGO_URL"])
db = client[ENV["DB_NAME"]]
result = {}
for role, collection in (("principal", db.users), ("teacher", db.users), ("student", db.students)):
    query = {"institute_id": INSTITUTE_ID}
    if role != "student":
        query["role"] = role
    else:
        query["batch_id"] = {"$nin": [None, ""]}
    doc = collection.find_one(query)
    payload = {
        "sub": doc["id"], "role": role, "institute_id": INSTITUTE_ID, "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    result[role] = {"id": doc["id"], "name": doc["name"], "token": jwt.encode(payload, ENV["JWT_SECRET"], algorithm="HS256")}
print(json.dumps(result))
client.close()
