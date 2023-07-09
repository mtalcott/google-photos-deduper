from celery import Celery

app = Celery('google_photos_deduper_tasks',
             broker='redis://redis:6379/0')
app.conf.result_backend = 'redis://redis:6379/0'

@app.task
def process_duplicates():
    return 'done'