from django.urls import path
from .views import CurrentUserView, CustomTokenObtainPairView, CustomTokenRefreshView, UsersListView

urlpatterns = [
    path("token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", CustomTokenRefreshView.as_view(), name="token_refresh"),
    path("me/", CurrentUserView.as_view(), name="current_user"),
    path("users/", UsersListView.as_view(), name="users_list"),
]
