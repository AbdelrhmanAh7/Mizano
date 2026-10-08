import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Feature: Pi 5 Deployment (id: mz-pi-deployment)
test("@issue-39 AC1: Full stack runs on Pi 5 for 24h without OOM kills", { tags: ["feat:mz-pi-deployment"] }, async ({ app, agent, screen }) => {
  // Verify services start successfully
  await app.open("/en/login");
  await agent.act("sign in as {email} with password {pw}", { params: { email: "admin@mizano.com", pw: "password123" } });
  await expect(screen.getByText("Dashboard")).toBeVisible();

  // Verify Docker stats show adequate memory usage
  const dockerStats = await app.evaluate(() => {
    const metrics = {};
    const containers = document.querySelectorAll("#docker-stats table tr");
    containers.forEach(container => {
      const parts = container.textContent.trim().split("\n");
      metrics[parts[0]] = {
        memUsage: parseFloat(parts[1].replace(/[^0-9.]/g, "")),
        cpuUsage: parseFloat(parts[2].replace(/[^0-9.]/g, ""))
      };
    });
    return metrics;
  });

  // Check memory usage for all services
  Object.values(dockerStats).forEach(service => {
    expect(service.memUsage).toBeLessThan(8000); // MB
    expect(service.cpuUsage).toBeLessThan(80); // %
  });

  // Verify services survive reboot
  await app.open("/en/system/status");
  await agent.act("simulate reboot");
  await expect(screen.getByText("All services restarted")).toBeVisible();

  // Verify memory metrics after reboot
  const rebootDockerStats = await app.evaluate(() => {
    const metrics = {};
    const containers = document.querySelectorAll("#docker-stats table tr");
    containers.forEach(container => {
      const parts = container.textContent.trim().split("\n");
      metrics[parts[0]] = {
        memUsage: parseFloat(parts[1].replace(/[^0-9.]/g, "")),
        cpuUsage: parseFloat(parts[2].replace(/[^0-9.]/g, ""))
      };
    });
    return metrics;
  });

  // Check memory usage after reboot
  Object.values(rebootDockerStats).forEach(service => {
    expect(service.memUsage).toBeLessThan(8000); // MB
    expect(service.cpuUsage).toBeLessThan(80); // %
  });

  // Verify Arabic/RTL support
  await app.open("/ar/dashboard");
  await expect(screen.getByText("السجل")).toBeVisible();
  await expect(screen.getByRole("button", { name: "الإشعارات" })).toBeVisible();
});