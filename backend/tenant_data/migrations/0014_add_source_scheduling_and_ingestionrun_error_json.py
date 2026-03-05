from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_data", "0013_add_notification_preferences_snooze_and_push"),
    ]

    operations = [
        migrations.AddField(
            model_name="source",
            name="schedule_cron",
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
        migrations.AddField(
            model_name="source",
            name="schedule_interval_minutes",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="ingestionrun",
            name="error_message",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.RunSQL(
            sql="""
            UPDATE tenant_data_ingestionrun
            SET error_detail = 'null'
            WHERE error_detail IS NOT NULL AND BTRIM(error_detail) = '';

            CREATE OR REPLACE FUNCTION tenant_data_is_json(input_text text)
            RETURNS boolean
            LANGUAGE plpgsql
            AS $$
            BEGIN
              PERFORM input_text::jsonb;
              RETURN TRUE;
            EXCEPTION WHEN others THEN
              RETURN FALSE;
            END;
            $$;

            UPDATE tenant_data_ingestionrun
            SET error_detail = json_build_object('message', error_detail)::text
            WHERE error_detail IS NOT NULL AND tenant_data_is_json(error_detail) = FALSE;

            DROP FUNCTION tenant_data_is_json(text);
            """,
            reverse_sql="""
            UPDATE tenant_data_ingestionrun
            SET error_detail = COALESCE(error_detail::text, '')
            WHERE error_detail IS NOT NULL;
            """,
        ),
        migrations.AlterField(
            model_name="ingestionrun",
            name="error_detail",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="ingestionrun",
            index=models.Index(fields=["source"], name="ingrun_source_idx"),
        ),
        migrations.AddIndex(
            model_name="ingestionrun",
            index=models.Index(fields=["-started_at"], name="ingrun_started_idx"),
        ),
    ]
