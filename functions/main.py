"""Callable Firebase entry point for Docs."""

import os

from firebase_admin import initialize_app
from firebase_functions import https_fn
from firebase_functions.options import set_global_options
from firebase_functions.params import SecretParam

from ai_engine import ActionEngine, EngineFailure
from ai_provider import DeepSeekProvider, ProviderFailure
from docs_service import handle
from docs_firestore import client

initialize_app()
set_global_options(max_instances=10)
DEEPSEEK_API_KEY = SecretParam("DEEPSEEK_API_KEY")
EMULATED_AI = bool(os.environ.get("FIRESTORE_EMULATOR_HOST"))


def _engine(request: https_fn.CallableRequest, with_provider: bool = False) -> ActionEngine:
    if not request.auth:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.UNAUTHENTICATED, "Sign in to use Docs AI")
    try:
        provider = (DeepSeekProvider(os.environ.get("DEEPSEEK_API_KEY", "") if EMULATED_AI
                                     else DEEPSEEK_API_KEY.value) if with_provider else None)
    except ProviderFailure as exc:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, str(exc)) from exc
    return ActionEngine(client(), request.auth.uid, provider)


def _call(operation, data):
    try:
        return operation(data)
    except EngineFailure as exc:
        code = next((item for item in https_fn.FunctionsErrorCode if item.value == exc.code),
                    https_fn.FunctionsErrorCode.INTERNAL)
        raise https_fn.HttpsError(code, str(exc), exc.details) from exc


@https_fn.on_call()
def docs_api(request: https_fn.CallableRequest) -> dict:
    uid = request.auth.uid if request.auth else None
    return handle(client(), uid, request.data)


@https_fn.on_call(secrets=[] if EMULATED_AI else [DEEPSEEK_API_KEY])
def interpretMessage(request: https_fn.CallableRequest) -> dict:
    return _call(_engine(request, True).interpret, request.data)


@https_fn.on_call()
def approveAction(request: https_fn.CallableRequest) -> dict:
    return _call(_engine(request).approve, request.data)


@https_fn.on_call()
def rejectAction(request: https_fn.CallableRequest) -> dict:
    return _call(_engine(request).reject, request.data)
