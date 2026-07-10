import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        # 1. Login
        resp = await client.post("http://localhost:8010/api/v1/auth/login", json={
            "email": "admin@e2m.com",
            "password": "password123"
        })
        print("Login status:", resp.status_code)
        token = resp.json()["access_token"]
        print("Got token")
        
        # 2. Try to create role (which was failing with 42501 RLS)
        resp2 = await client.post("http://localhost:8010/api/v1/roles/", headers={
            "Authorization": f"Bearer {token}"
        }, json={
            "title": "Test Role Auth Bug",
            "description": "Testing",
            "requirements": [],
            "employment_type": "full_time"
        })
        print("Create role status:", resp2.status_code)
        print("Create role response:", resp2.text)

if __name__ == "__main__":
    asyncio.run(main())
