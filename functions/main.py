"""Callable Firebase entry point for Docs."""

from firebase_admin import initialize_app
from firebase_functions import https_fn
from firebase_functions.options import set_global_options

from docs_service import handle
from docs_firestore import client

initialize_app()
set_global_options(max_instances=10)


@https_fn.on_call()
def docs_api(request: https_fn.CallableRequest) -> dict:
    uid = request.auth.uid if request.auth else None
    return handle(client(), uid, request.data)
