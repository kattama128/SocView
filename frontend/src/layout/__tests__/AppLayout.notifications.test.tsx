import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppLayout from "../AppLayout";

const navigateMock = vi.fn();
const fetchNotificationsMock = vi.fn();
const ackNotificationMock = vi.fn();
let wsOnNotification: (() => void) | null = null;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    Outlet: () => <div data-testid="outlet" />,
  };
});

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: "manager",
      role: "manager",
      permissions: [],
    },
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../context/CustomerContext", () => ({
  useCustomer: () => ({
    customers: [{ id: 1, name: "Acme", code: "ACM" }],
    selectedCustomer: null,
    selectedCustomerId: null,
    setSelectedCustomerId: vi.fn(),
  }),
}));

vi.mock("../../hooks/useNotificationsWS", () => ({
  default: ({ onNotification }: { onNotification: () => void }) => {
    wsOnNotification = onNotification;
  },
}));

vi.mock("../../components/NotificationDrawer", () => ({
  default: ({ onOpenAlert }: { onOpenAlert: (alertId: number) => void }) => (
    <button data-testid="mock-drawer-open-alert" onClick={() => onOpenAlert(123)}>
      Open from drawer
    </button>
  ),
}));

vi.mock("../../components/ThemeToggle", () => ({
  default: () => <div data-testid="theme-toggle" />,
}));

vi.mock("../../components/StatusBar", () => ({
  default: () => <div data-testid="status-bar" />,
}));

vi.mock("../../services/alertsApi", () => ({
  fetchNotifications: (...args: unknown[]) => fetchNotificationsMock(...args),
  ackNotification: (...args: unknown[]) => ackNotificationMock(...args),
  ackAllNotifications: vi.fn().mockResolvedValue(undefined),
  snoozeNotification: vi.fn().mockResolvedValue(undefined),
}));

describe("AppLayout critical notification popup", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    fetchNotificationsMock.mockReset();
    ackNotificationMock.mockReset();
    ackNotificationMock.mockResolvedValue(undefined);
    wsOnNotification = null;
    window.sessionStorage.clear();

    fetchNotificationsMock.mockResolvedValue({
      unread_count: 1,
      results: [
        {
          id: 99,
          alert: 123,
          alert_title: "Critical alert",
          title: "Critical alert",
          message: "Disk full",
          severity: "critical",
          metadata: {},
          is_active: true,
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("chiude con la X senza navigare", async () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await screen.findByTestId("critical-popup-alert");
    const closeButton = screen.getByTestId("critical-popup-close-button");
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTestId("critical-popup-alert")).not.toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("naviga solo con azione Apri", async () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await screen.findByTestId("critical-popup-alert");
    const openButton = screen.getByTestId("critical-popup-open-alert");
    fireEvent.click(openButton);

    expect(ackNotificationMock).toHaveBeenCalledWith(99);
    expect(navigateMock).toHaveBeenCalledWith("/alerts/123");
    await waitFor(() => {
      expect(screen.queryByTestId("critical-popup-alert")).not.toBeInTheDocument();
    });
  });

  it("chiude il popup quando apro alert dal drawer", async () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await screen.findByTestId("critical-popup-alert");
    fireEvent.click(screen.getByTestId("mock-drawer-open-alert"));

    expect(navigateMock).toHaveBeenCalledWith("/alerts/123");
    await waitFor(() => {
      expect(screen.queryByTestId("critical-popup-alert")).not.toBeInTheDocument();
    });
  });

  it("chiude il popup se il refresh non trova critical unread", async () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await screen.findByTestId("critical-popup-alert");

    fetchNotificationsMock.mockResolvedValueOnce({
      unread_count: 0,
      results: [],
    });
    wsOnNotification?.();

    await waitFor(() => {
      expect(screen.queryByTestId("critical-popup-alert")).not.toBeInTheDocument();
    });
  });

  it("non riapre lo stesso popup critico dopo remount se ancora unread", async () => {
    const firstRender = render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await screen.findByTestId("critical-popup-alert");
    firstRender.unmount();

    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("critical-popup-alert")).not.toBeInTheDocument();
    });
  });
});
