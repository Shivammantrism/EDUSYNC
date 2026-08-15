"""Remove only disposable Phase 1 UI automation records."""
from dotenv import dotenv_values
from pymongo import MongoClient

ENV = dotenv_values("/app/backend/.env")
client = MongoClient(ENV["MONGO_URL"])
db = client[ENV["DB_NAME"]]
result = db.homework.delete_many({"title": {"$regex": "^TEST_UI_Phase1_HW_"}})
print(f"Deleted {result.deleted_count} disposable homework record(s)")
client.close()
