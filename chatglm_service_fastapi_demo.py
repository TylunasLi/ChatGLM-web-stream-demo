# 先启动chatglm_service_fastapi.py
# 然后用下面代码能一截截把response拉回来。但不能在jupyter notebook上用。

import requests
import sys
import re
import json

def receive_yield_info():
    url = "http://0.0.0.0:8800/stream/"
    data = {"query": "你好", "history": []}  # Example data, modify as needed
    response = requests.post(url, json=data, stream=True)
    for line in response.iter_lines():
        if line:
            yield line.decode('utf-8')

def print_and_erase(text):  # 这样能擦字符，但只能在终端上运行才有效
    sys.stdout.write('\033[1K')  # 清除当前行
    sys.stdout.write('\033[0G')  # 移动光标到行首
    sys.stdout.write(text)
    sys.stdout.flush()

if __name__ == "__main__":   
    pattern = re.compile(r'\{.*\}') # 匹配字符串中的 JSON 数据
    for item in receive_yield_info():
        match = pattern.search(item)  # 查找匹配的 JSON 数据
        if match:
            json_data = match.group()   # 提取 JSON 数据        
            data_dict = json.loads(json_data)   # 将 JSON 数据转换为字典
            print_and_erase(dict(data_dict)["response"])
