#! /usr/bin/python3
# -*- coding: utf-8 -*-
# ChatGLM-web-stream-demo
# Copyright (c) 2023 TylunasLi, MIT License

from gevent import monkey, pywsgi
monkey.patch_all()
from flask import Flask, request, Response
from flask_cors import CORS
import torch
from transformers import AutoTokenizer, AutoModel
import logging
import os
import json
import sys

def getLogger(name, file_name, use_formatter=True):
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    console_handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter('%(asctime)s    %(message)s')
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    logger.addHandler(console_handler)
    if file_name:
        handler = logging.FileHandler(file_name, encoding='utf8')
        handler.setLevel(logging.INFO)
        if use_formatter:
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(message)s')
            handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger

logger = getLogger('ChatGLM', 'chatlog.log')

MAX_HISTORY = 5


def format_sse(data: str, event=None) -> str:
    msg = 'data: {}\n\n'.format(data)
    if event is not None:
        msg = 'event: {}\n{}'.format(event, msg)
    return msg


class ChatGLM():
    def __init__(self) -> None:
        logger.info("Start initialize model...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            "THUDM/chatglm-6b", trust_remote_code=True)
        self.model = AutoModel.from_pretrained(
            "THUDM/chatglm-6b", trust_remote_code=True).half().cuda()  # .quantize(8)
        _, _ = self.model.chat(self.tokenizer, "你好", history=[])
        logger.info("Model initialization finished.")

    def clear(self, gpu_id) -> None:
        if torch.cuda.is_available():
            with torch.cuda.device("gpu:{}".format(gpu_id)):
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()

    def answer(self, query: str, history):
        response, history = self.model.chat(self.tokenizer, query, history=history)
        history = [list(h) for h in history]
        return response, history

    def stream(self, query, history):
        if query is None or history is None:
            yield {"query": "", "response": "", "history": [], "finished": True}
        size = 0
        response = ""
        for response, history in self.model.stream_chat(self.tokenizer, query, history):
            this_response = response[size:]
            history = [list(h) for h in history]
            size = len(response)
            yield {"delta": this_response, "response": response, "finished": False}
        logger.info("Answer - {}".format(response))
        yield {"query": query, "delta": "[EOS]", "response": response, "history": history, "finished": True}


def start_server(http_address: str, port: int, gpu_id: str):
    os.environ['CUDA_DEVICE_ORDER'] = 'PCI_BUS_ID'
    os.environ['CUDA_VISIBLE_DEVICES'] = gpu_id

    bot = ChatGLM()
    app = Flask(__name__)
    cors = CORS(app, supports_credentials=True)
    @app.route("/")
    def index():
        return Response(json.dumps({'message': 'started', 'success': True}, ensure_ascii=False), content_type="application/json")

    @app.route("/chat", methods=["GET", "POST"])
    def answer_question():
        result = {"query": "", "response": "", "success": False}
        try:
            if "application/json" in request.content_type:
                arg_dict = request.get_json()
                text = arg_dict["query"]
                ori_history = arg_dict["history"]
                logger.info("Query - {}".format(text))
                if len(ori_history) > 0:
                    logger.info("History - {}".format(ori_history))
                history = ori_history[-MAX_HISTORY:]
                history = [tuple(h) for h in history]
                response, history = bot.answer(text, history)
                logger.info("Answer - {}".format(response))
                ori_history.append((text, response))
                result = {"query": text, "response": response,
                          "history": ori_history, "success": True}
        except Exception as e:
            logger.error(f"error: {e}")
        return Response(json.dumps(result, ensure_ascii=False), content_type="application/json")

    @app.route("/stream", methods=["POST"])
    def answer_question_stream():
        def decorate(generator):
            for item in generator:
                yield format_sse(json.dumps(item, ensure_ascii=False), 'delta')
        result = {"query": "", "response": "", "success": False}
        text, history = None, None
        try:
            if "application/json" in request.content_type:
                arg_dict = request.get_json()
                text = arg_dict["query"]
                ori_history = arg_dict["history"]
                logger.info("Query - {}".format(text))
                if len(ori_history) > 0:
                    logger.info("History - {}".format(ori_history))
                history = ori_history[-MAX_HISTORY:]
                history = [tuple(h) for h in history]
        except Exception as e:
            logger.error(f"error: {e}")
        return Response(decorate(bot.stream(text, history)), mimetype='text/event-stream')

    @app.route("/clear", methods=["GET", "POST"])
    def clear():
        history = []
        try:
            bot.clear(gpu_id)
            return Response(json.dumps({"success": True}, ensure_ascii=False), content_type="application/json")
        except Exception as e:
            return Response(json.dumps({"success": False}, ensure_ascii=False), content_type="application/json")

    @app.route("/score", methods=["GET"])
    def score_answer():
        score = request.get("score")
        logger.info("score: {}".format(score))
        return {'success': True}

    logger.info("starting server...")
    server = pywsgi.WSGIServer((http_address, port), app)
    server.serve_forever()


if __name__ == '__main__':
    start_server('0.0.0.0', 8800, gpu_id='0')
