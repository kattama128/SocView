import os
import sys
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR
ROOT_DIR = BASE_DIR.parent

load_dotenv(ROOT_DIR / ".env")


def _env_list(name, default=""):
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]

DEBUG = os.getenv("DEBUG", "False").lower() == "true"
SECRET_KEY = os.getenv("SECRET_KEY", "change-me")

ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,.localhost")

SHARED_APPS = (
    "django_tenants",
    "corsheaders",
    "customers",
    "accounts",
    "core",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
)

TENANT_APPS = (
    "tenant_data",
)

INSTALLED_APPS = list(SHARED_APPS) + [app for app in TENANT_APPS if app not in SHARED_APPS]

TENANT_MODEL = "customers.Client"
TENANT_DOMAIN_MODEL = "customers.Domain"
SHOW_PUBLIC_IF_NO_TENANT_FOUND = True
PUBLIC_SCHEMA_DOMAIN = os.getenv("PUBLIC_SCHEMA_DOMAIN", "localhost")

MIDDLEWARE = [
    "django_tenants.middleware.main.TenantMainMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "socview.urls"
PUBLIC_SCHEMA_URLCONF = "socview.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "socview.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django_tenants.postgresql_backend",
        "NAME": os.getenv("POSTGRES_DB", "socview"),
        "USER": os.getenv("POSTGRES_USER", "socview"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "socview"),
        "HOST": os.getenv("POSTGRES_HOST", "postgres"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    }
}

DATABASE_ROUTERS = (
    "django_tenants.routers.TenantSyncRouter",
)

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "it-it"
TIME_ZONE = "Europe/Rome"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("DRF_THROTTLE_ANON", "120/min"),
        "auth": os.getenv("DRF_THROTTLE_AUTH", "20/min"),
        "webhook": os.getenv("DRF_THROTTLE_WEBHOOK", "120/min"),
    },
}

ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "30"))
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "1"))

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=ACCESS_TOKEN_MINUTES),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=REFRESH_TOKEN_DAYS),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "SocView API",
    "DESCRIPTION": "API bootstrap per piattaforma SOC multi-tenant",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVE_PERMISSIONS": ["rest_framework.permissions.AllowAny"],
}

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/1")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/2")
CELERY_TIMEZONE = TIME_ZONE
DEFAULT_SEARCH_BACKEND = "postgres" if "test" in sys.argv else "auto"
SEARCH_BACKEND = os.getenv("SEARCH_BACKEND", DEFAULT_SEARCH_BACKEND)
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
ELASTICSEARCH_INDEX_PREFIX = os.getenv("ELASTICSEARCH_INDEX_PREFIX", "socview-alerts")
ELASTICSEARCH_TIMEOUT_SECONDS = int(os.getenv("ELASTICSEARCH_TIMEOUT_SECONDS", "3"))
SEARCH_INDEX_SYNC_ENABLED = os.getenv("SEARCH_INDEX_SYNC_ENABLED", "true").lower() == "true"
DEFAULT_SEARCH_INDEX_SYNC_ASYNC = "false" if "test" in sys.argv else "true"
SEARCH_INDEX_SYNC_ASYNC = os.getenv("SEARCH_INDEX_SYNC_ASYNC", DEFAULT_SEARCH_INDEX_SYNC_ASYNC).lower() == "true"
MAX_ATTACHMENT_SIZE_MB = int(os.getenv("MAX_ATTACHMENT_SIZE_MB", "25"))
ENABLE_DEV_ATTACHMENT_SCANNER = os.getenv("ENABLE_DEV_ATTACHMENT_SCANNER", "false").lower() == "true"
ATTACHMENT_SCAN_BACKEND = os.getenv("ATTACHMENT_SCAN_BACKEND", "clamav").strip().lower()
BLOCK_UNSCANNED_ATTACHMENTS = os.getenv("BLOCK_UNSCANNED_ATTACHMENTS", "false").lower() == "true"
ATTACHMENT_ALLOWED_EXTENSIONS = os.getenv("ATTACHMENT_ALLOWED_EXTENSIONS")
ATTACHMENT_BLOCKED_EXTENSIONS = os.getenv("ATTACHMENT_BLOCKED_EXTENSIONS")
ATTACHMENT_ALLOWED_MIME_TYPES = os.getenv("ATTACHMENT_ALLOWED_MIME_TYPES")
ATTACHMENT_BLOCKED_MIME_TYPES = os.getenv("ATTACHMENT_BLOCKED_MIME_TYPES")
CLAMAV_HOST = os.getenv("CLAMAV_HOST", "clamav")
CLAMAV_PORT = int(os.getenv("CLAMAV_PORT", "3310"))
CLAMAV_TIMEOUT_SECONDS = int(os.getenv("CLAMAV_TIMEOUT_SECONDS", "5"))
AUDIT_RETENTION_DAYS = int(os.getenv("AUDIT_RETENTION_DAYS", "90"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

CORS_ALLOW_ALL_ORIGINS = os.getenv("CORS_ALLOW_ALL_ORIGINS", "false").lower() == "true"
CORS_ALLOWED_ORIGINS = _env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost,http://tenant1.localhost,http://tenant2.localhost,https://localhost,https://tenant1.localhost,https://tenant2.localhost",
)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "false").lower() == "true"
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
CSRF_COOKIE_SECURE = os.getenv("CSRF_COOKIE_SECURE", "false").lower() == "true"
CSRF_TRUSTED_ORIGINS = _env_list("CSRF_TRUSTED_ORIGINS", "http://localhost,https://localhost,http://tenant1.localhost,https://tenant1.localhost,http://tenant2.localhost,https://tenant2.localhost")
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv("SECURE_HSTS_INCLUDE_SUBDOMAINS", "false").lower() == "true"
SECURE_HSTS_PRELOAD = os.getenv("SECURE_HSTS_PRELOAD", "false").lower() == "true"
SECURE_REFERRER_POLICY = os.getenv("SECURE_REFERRER_POLICY", "same-origin")
X_FRAME_OPTIONS = os.getenv("X_FRAME_OPTIONS", "DENY")
SECURE_CONTENT_TYPE_NOSNIFF = os.getenv("SECURE_CONTENT_TYPE_NOSNIFF", "true").lower() == "true"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "core.logging_utils.JsonLogFormatter",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        }
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
}

CELERY_BEAT_SCHEDULE = {
    "heartbeat-every-minute": {
        "task": "core.tasks.heartbeat",
        "schedule": 60.0,
    },
    "ingestion-scheduler-every-30-seconds": {
        "task": "tenant_data.tasks.run_ingestion_scheduler",
        "schedule": 30.0,
    },
    "audit-retention-daily": {
        "task": "tenant_data.tasks.cleanup_audit_logs_task",
        "schedule": 86400.0,
    },
}
