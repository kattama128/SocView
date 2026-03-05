from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    scope = "auth"


class WebhookRateThrottle(AnonRateThrottle):
    scope = "webhook"


class DefaultUserRateThrottle(UserRateThrottle):
    scope = "auth"
