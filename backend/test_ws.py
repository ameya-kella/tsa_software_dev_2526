# test_ws.py
import asyncio
import websockets
import json
import numpy as np

async def test():
    async with websockets.connect("ws://localhost:8000/ws") as ws:
        # Send fake landmarks
        fake_landmarks = np.zeros((543,3)).tolist()
        await ws.send(json.dumps({"landmarks": fake_landmarks, "generate_sentence": False}))
        response = await ws.recv()
        print("Response:", response)

asyncio.run(test())
