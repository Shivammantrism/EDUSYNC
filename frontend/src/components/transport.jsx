# main.py or routers/transport.py
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/api/v1/students", tags=["Transport"])

# Assuming db is initialized globally in your FastAPI app
client = AsyncIOMotorClient("mongodb://localhost:27017")
db = client.edusync

class TransportOptInRequest(BaseModel):
    opt_in: bool
    route_id: Optional[str] = None

class FeeAdjustment(BaseModel):
    description: str
    amount: float
    date_added: datetime

@router.post("/{student_id}/transport-opt-in")
async def toggle_transport(student_id: str, request: TransportOptInRequest):
    student_collection = db.students
    
    # Check if student exists
    student = await student_collection.find_one({"student_id": student_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    update_query = {
        "$set": {
            "transport.opted_in": request.opt_in,
            "transport.route_id": request.route_id if request.opt_in else None
        }
    }

    # If opting in, append the standard transport fee to their dues
    if request.opt_in:
        transport_fee = {
            "description": "Monthly Transport Fee",
            "amount": 1500.00,  # Or fetch dynamically based on route_id
            "date_added": datetime.utcnow()
        }
        update_query["$push"] = {"fee_dues": transport_fee}
    
    # Note: If opting out, you might want logic to $pull the fee if unpaid

    result = await student_collection.update_one(
        {"student_id": student_id}, 
        update_query
    )

    if result.modified_count == 1:
        return {"message": "Transport preferences updated successfully", "opted_in": request.opt_in}
    
    raise HTTPException(status_code=400, detail="Failed to update transport preferences")
