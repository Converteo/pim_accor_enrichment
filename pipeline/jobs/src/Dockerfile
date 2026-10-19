FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY schemas ./schemas
# One image, one Cloud Run job per step: the job's args name the step (extract_pim.py, matching.py, judge.py, enrich.py, export.py)
ENTRYPOINT ["python"]
CMD ["matching.py"]
