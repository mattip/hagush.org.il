FROM python:3.13-slim

RUN apt-get update && apt-get install -y imagemagick && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first — this layer is cached unless requirements.txt changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code — changes here don't invalidate the pip cache layer
COPY . .

EXPOSE 8080
CMD ["streamlit", "run", "app_streamlit.py", \
     "--server.port=8080", \
     "--server.address=0.0.0.0", \
     "--server.headless=true"]
