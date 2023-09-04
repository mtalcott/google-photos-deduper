import os
import time
from selenium import webdriver

SELENIUM_HOST = os.environ.get("SELENIUM_HOST", "http://localhost:4444")

print("Test Execution Started")
options = webdriver.ChromeOptions()
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--ignore-ssl-errors=yes")
options.add_argument("--ignore-certificate-errors")
driver = webdriver.Remote(command_executor=f"{SELENIUM_HOST}/wd/hub", options=options)
# maximize the window size
driver.maximize_window()
time.sleep(10)
# navigate to browserstack.com
driver.get("https://www.browserstack.com/")
time.sleep(10)
# click on the Get started for free button
driver.find_element_by_link_text("Get started free").click()
time.sleep(10)
# close the browser
driver.close()
driver.quit()
print("Test Execution Successfully Completed!")
