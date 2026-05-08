import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger()


def fetch_all_unchecked(zcql, today_str, page_size=200):
    """Paginated fetch of all records where check_in exists but check_out is NULL."""
    all_rows = []
    offset = 0

    while True:
        query = (
            "SELECT ROWID, user_id, tenant_id, check_in_time, check_out_time, status "
            "FROM attendance_records "
            f"WHERE attendance_date = '{today_str}' "
            "AND check_in_time IS NOT NULL "
            "AND check_out_time IS NULL "
            f"LIMIT {offset},{page_size}"
        )
        logger.info(f"  Executing ZCQL [offset={offset}]: {query}")

        results = zcql.execute_query(query) or []

        if not results:
            logger.info(f"  No more records at offset={offset}. Pagination complete.")
            break

        for item in results:
            row = item.get("attendance_records") or item
            all_rows.append(row)

        logger.info(f"  Fetched {len(results)} record(s) at offset={offset} | Running total: {len(all_rows)}")

        if len(results) < page_size:
            break  # Last page — no need for another round trip

        offset += page_size

    return all_rows


def handler(job_request, context):
    logger.info("=== Auto Checkout Job Started ===")

    try:
        # ── Job & project meta ──────────────────────────────────────────────
        job_details      = job_request.get_job_details()
        project_details  = job_request.get_project_details()
        job_meta_details = job_request.get_job_meta_details()

        logger.info(f"Job Details     : {job_details}")
        logger.info(f"Project Details : {project_details}")
        logger.info(f"Job Meta Details: {job_meta_details}")

        # ── Catalyst SDK bootstrap ──────────────────────────────────────────
        import zcatalyst_sdk as catalyst
        app = catalyst.initialize()
        logger.info("Catalyst app initialized successfully")

        # ── Today's date & forced checkout time in IST ──────────────────────
        IST      = timezone(timedelta(hours=5, minutes=30))
        now_ist  = datetime.now(IST)
        today_str     = now_ist.strftime("%Y-%m-%d")   # e.g. "2026-05-07"
        checkout_time = f"{today_str} 23:59:00"         # 11:59 PM IST

        logger.info(f"UTC now          : {datetime.now(timezone.utc)}")
        logger.info(f"IST now          : {now_ist}")
        logger.info(f"Date for query   : {today_str}")
        logger.info(f"Forced checkout  : {checkout_time}")

        # ── Fetch all unchecked-out records (paginated) ─────────────────────
        logger.info("Fetching records with missing checkout...")
        zcql = app.zcql()
        rows = fetch_all_unchecked(zcql, today_str)

        if not rows:
            logger.info("No records found without checkout — everyone is checked out. Exiting.")
            context.close_with_success()
            return

        logger.info(f"Total records to process: {len(rows)}")

        # ── Datastore table reference ───────────────────────────────────────
        table = app.datastore().table("attendance_records")

        success_count = 0
        failure_count = 0
        skipped_count = 0

        # ── Loop & update each record ───────────────────────────────────────
        for idx, row in enumerate(rows, start=1):
            row_id  = str(row.get("ROWID", "")).strip()
            user_id = row.get("user_id", "N/A")
            tenant  = row.get("tenant_id", "N/A")

            logger.info(
                f"[{idx}/{len(rows)}] Processing → ROWID={row_id} | "
                f"user_id={user_id} | tenant_id={tenant}"
            )

            if not row_id:
                logger.warning(f"  ↳ Skipped: ROWID missing in row: {row}")
                skipped_count += 1
                continue

            try:
                update_data = {
                    "ROWID"         : row_id,
                    "check_out_time": checkout_time,  # "2026-05-07 23:59:00"
                    "bot_checkout"  : True,            # marks it was done by the job
                }

                logger.info(f"  ↳ Updating ROWID={row_id} with: {update_data}")
                update_response = table.update_row(update_data)
                logger.info(f"  ↳ Update response: {update_response}")

                success_count += 1
                logger.info(f"  ↳ SUCCESS: Auto-checkout applied for user_id={user_id} (ROWID={row_id})")

            except Exception as row_err:
                failure_count += 1
                logger.error(
                    f"  ↳ FAILED to update ROWID={row_id} for user_id={user_id}: {str(row_err)}"
                )

        # ── Final summary ───────────────────────────────────────────────────
        logger.info("=== Auto Checkout Job — Summary ===")
        logger.info(f"  Date processed       : {today_str}")
        logger.info(f"  Total records found  : {len(rows)}")
        logger.info(f"  Successfully updated : {success_count}")
        logger.info(f"  Failed to update     : {failure_count}")
        logger.info(f"  Skipped (no ROWID)   : {skipped_count}")
        logger.info("=== Auto Checkout Job Completed ===")

        context.close_with_success()

    except Exception as e:
        logger.exception(f"CRITICAL ERROR in auto-checkout job: {str(e)}")
        context.close_with_failure()