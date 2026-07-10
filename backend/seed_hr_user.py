import os
import asyncio
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# We need the service role key to bypass RLS and insert into hr_users
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(url, key)

async def seed_hr_user():
    admin_auth_user_id = "00a5ba91-8471-4b83-8c9e-72b52e1a1ed5"
    admin_email = "admin@e2m.com"
    
    print(f"Checking if HR user exists for {admin_email}...")
    
    # Check if user already exists
    response = supabase.table("hr_users").select("*").eq("auth_user_id", admin_auth_user_id).execute()
    
    if len(response.data) > 0:
        print("HR User already exists:", response.data[0])
    else:
        print(f"Creating HR user for {admin_email}...")
        # Insert new HR user
        new_user = {
            "auth_user_id": admin_auth_user_id,
            "email": admin_email,
            "name": "Admin User",
            "role": "admin",
            "is_active": True
        }
        insert_response = supabase.table("hr_users").insert(new_user).execute()
        print("Inserted user:", insert_response.data)

if __name__ == "__main__":
    asyncio.run(seed_hr_user())
