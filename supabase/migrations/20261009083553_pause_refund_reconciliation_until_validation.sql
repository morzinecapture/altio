-- Financial document issuance remains paused until a controlled end-to-end validation is explicitly authorized.
SELECT cron.alter_job(job_id:=jobid,active:=false) FROM cron.job WHERE jobname='altio-refund-reconciliation';
