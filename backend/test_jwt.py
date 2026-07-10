from app.config import get_settings
from jose import jwt

settings = get_settings()
token = settings.SUPABASE_ANON_KEY

try:
    print("Anon Key Alg:", jwt.get_unverified_header(token))
    
    # Try decoding with python-jose
    payload = jwt.decode(
        token,
        settings.SUPABASE_JWT_SECRET,
        algorithms=["HS256"],
        options={"verify_aud": False},
    )
    print("Success:", payload)
except Exception as e:
    import traceback
    traceback.print_exc()
